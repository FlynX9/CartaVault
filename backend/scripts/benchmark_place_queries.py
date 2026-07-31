"""Benchmark the principal place API read paths on PostgreSQL/PostGIS.

Run only against a disposable benchmark database or a read replica. The script
is read-only and rejects databases whose name does not contain ``benchmark`` or
``test`` unless ``--allow-read-replica`` is explicitly provided.
"""

from __future__ import annotations

import argparse
import json
import os
import statistics
import sys
import threading
import tracemalloc
from collections.abc import Generator
from pathlib import Path
from time import perf_counter
from types import SimpleNamespace
from uuid import UUID

from sqlalchemy import create_engine, event, select, text
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session, sessionmaker


BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))


class QueryMetrics:
    """Collect SQL timings for one sequential benchmark request."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self.reset()

    def reset(self) -> None:
        with self._lock:
            self.count = 0
            self.elapsed_ms = 0.0

    def before(self, _conn, _cursor, _statement, _parameters, context, _many) -> None:
        context._cartavault_benchmark_started = perf_counter()

    def after(self, _conn, _cursor, _statement, _parameters, context, _many) -> None:
        started = getattr(context, "_cartavault_benchmark_started", None)
        if started is None:
            return
        with self._lock:
            self.count += 1
            self.elapsed_ms += (perf_counter() - started) * 1000

    def snapshot(self) -> tuple[int, float]:
        with self._lock:
            return self.count, self.elapsed_ms


def percentile(values: list[float], ratio: float) -> float:
    ordered = sorted(values)
    index = min(len(ordered) - 1, max(0, round((len(ordered) - 1) * ratio)))
    return ordered[index]


def explain(connection, label: str, statement: str, parameters: dict[str, object]) -> dict[str, object]:
    plan_lines = list(
        connection.execute(
            text(f"EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT) {statement}"),
            parameters,
        ).scalars()
    )
    execution_line = next(
        (line for line in reversed(plan_lines) if line.startswith("Execution Time:")),
        "Execution Time: unknown",
    )
    return {"label": label, "execution": execution_line, "plan": plan_lines}


def collect_plans(engine, map_id: UUID, limit: int, deep_offset: int) -> list[dict[str, object]]:
    parameters = {
        "map_id": map_id,
        "limit": limit,
        "offset": deep_offset,
        "search": "%Museum%",
    }
    statements = (
        (
            "list first page",
            """
            SELECT id, name, status_id
            FROM places
            WHERE map_id = :map_id AND deleted_at IS NULL
            ORDER BY lower(name), id
            LIMIT :limit
            """,
        ),
        (
            "list deep page",
            """
            SELECT id, name, status_id
            FROM places
            WHERE map_id = :map_id AND deleted_at IS NULL
            ORDER BY lower(name), id
            LIMIT :limit OFFSET :offset
            """,
        ),
        (
            "partial text search",
            """
            SELECT id, name, status_id
            FROM places
            WHERE map_id = :map_id
              AND deleted_at IS NULL
              AND (name ILIKE :search OR description ILIKE :search OR region ILIKE :search)
            ORDER BY lower(name), id
            LIMIT :limit
            """,
        ),
        (
            "facet base",
            """
            SELECT count(*)
            FROM places
            WHERE map_id = :map_id AND deleted_at IS NULL
            """,
        ),
        (
            "visible bounds",
            """
            SELECT id, name, status_id
            FROM places
            WHERE map_id = :map_id
              AND deleted_at IS NULL
              AND location IS NOT NULL
              AND ST_Intersects(location, ST_MakeEnvelope(-5, 42, 10, 52, 4326))
            LIMIT 5000
            """,
        ),
        (
            "visible viewport",
            """
            SELECT id, name, status_id
            FROM places
            WHERE map_id = :map_id
              AND deleted_at IS NULL
              AND location IS NOT NULL
              AND ST_Intersects(location, ST_MakeEnvelope(2, 48, 3, 49, 4326))
            LIMIT 5000
            """,
        ),
    )
    with engine.connect() as connection:
        return [
            explain(connection, label, statement, parameters)
            for label, statement in statements
        ]


def benchmark_request(
    client,
    metrics: QueryMetrics,
    path: str,
    params: dict[str, object],
    repeats: int,
) -> dict[str, object]:
    response = client.get(path, params=params)
    if response.status_code != 200:
        raise RuntimeError(f"{path} returned {response.status_code}: {response.text[:300]}")

    samples: list[dict[str, float | int]] = []
    for _ in range(repeats):
        metrics.reset()
        tracemalloc.start()
        started = perf_counter()
        response = client.get(path, params=params)
        total_ms = (perf_counter() - started) * 1000
        _, peak_bytes = tracemalloc.get_traced_memory()
        tracemalloc.stop()
        if response.status_code != 200:
            raise RuntimeError(f"{path} returned {response.status_code}: {response.text[:300]}")
        query_count, database_ms = metrics.snapshot()
        samples.append(
            {
                "total_ms": total_ms,
                "database_ms": database_ms,
                "query_count": query_count,
                "response_bytes": len(response.content),
                "python_peak_kib": peak_bytes / 1024,
            }
        )

    totals = [float(sample["total_ms"]) for sample in samples]
    database = [float(sample["database_ms"]) for sample in samples]
    peaks = [float(sample["python_peak_kib"]) for sample in samples]
    return {
        "median_total_ms": round(statistics.median(totals), 2),
        "p95_total_ms": round(percentile(totals, 0.95), 2),
        "median_database_ms": round(statistics.median(database), 2),
        "median_serialization_and_app_ms": round(
            statistics.median(total - db for total, db in zip(totals, database, strict=True)),
            2,
        ),
        "query_count": int(statistics.median(sample["query_count"] for sample in samples)),
        "response_bytes": int(statistics.median(sample["response_bytes"] for sample in samples)),
        "median_python_peak_kib": round(statistics.median(peaks), 1),
    }


def scenarios(session: Session, map_id: UUID, place_count: int) -> list[tuple[str, str, dict[str, object]]]:
    from app.categories.models import Category
    from app.places.models import Place
    from app.statuses.models import PlaceStatus
    from app.tags.models import Tag

    category_id = session.scalar(select(Category.id).where(Category.map_id == map_id).limit(1))
    tag_id = session.scalar(select(Tag.id).where(Tag.map_id == map_id).limit(1))
    status_id = session.scalar(select(PlaceStatus.id).where(PlaceStatus.map_id == map_id).limit(1))
    target_place_id = session.scalar(
        select(Place.id)
        .where(Place.map_id == map_id, Place.deleted_at.is_(None))
        .order_by(Place.name)
        .offset(max(0, place_count * 3 // 4))
        .limit(1)
    )
    base: dict[str, object] = {"map_id": str(map_id), "limit": 50}
    deep_offset = min(5000, max(0, place_count - 100))
    result = [
        ("list_first", "/places", base),
        ("list_next", "/places", {**base, "offset": 50}),
        ("list_deep", "/places", {**base, "offset": deep_offset}),
        ("search", "/places", {**base, "q": "Museum"}),
        ("region_filter", "/places", {**base, "regions": "Region 1"}),
        ("favorite_filter", "/places", {**base, "is_favorite": "true"}),
        ("photo_filter", "/places", {**base, "has_photos": "true"}),
        ("trip_filter", "/places", {**base, "in_trip": "false"}),
        ("updated_sort", "/places", {**base, "sort_by": "updated_at", "sort_direction": "desc"}),
        ("facets", "/places/facets", {"map_id": str(map_id)}),
        (
            "markers_bounds",
            "/places/map",
            {
                "map_id": str(map_id),
                "min_latitude": 42,
                "max_latitude": 52,
                "min_longitude": -5,
                "max_longitude": 10,
                "limit": 5000,
                "include_meta": "true",
            },
        ),
        (
            "markers_viewport",
            "/places/map",
            {
                "map_id": str(map_id),
                "min_latitude": 48,
                "max_latitude": 49,
                "min_longitude": 2,
                "max_longitude": 3,
                "limit": 5000,
                "include_meta": "true",
            },
        ),
    ]
    if category_id:
        result.append(("category_filter", "/places", {**base, "category_ids": str(category_id)}))
    if tag_id:
        result.append(("tag_filter", "/places", {**base, "tag_ids": str(tag_id)}))
    if status_id:
        result.append(("status_filter", "/places", {**base, "status_ids": str(status_id)}))
    if target_place_id:
        result.append(
            (
                "list_position",
                f"/places/{target_place_id}/list-position",
                {"map_id": str(map_id), "page_size": 100},
            )
        )
    return result


def run(args: argparse.Namespace) -> dict[str, object]:
    url = make_url(args.database_url)
    database_name = (url.database or "").lower()
    if not args.allow_read_replica and not any(token in database_name for token in ("benchmark", "test")):
        raise SystemExit(
            "Refusing to benchmark a non-benchmark database. "
            "Use a disposable database or pass --allow-read-replica explicitly."
        )

    os.environ["DATABASE_URL"] = args.database_url
    from fastapi.testclient import TestClient

    from app.auth.dependencies import get_current_user
    from app.database import get_db
    from app.main import app

    engine = create_engine(args.database_url, pool_pre_ping=True)
    session_factory = sessionmaker(bind=engine, expire_on_commit=False)
    metrics = QueryMetrics()
    event.listen(engine, "before_cursor_execute", metrics.before)
    event.listen(engine, "after_cursor_execute", metrics.after)

    def database_override() -> Generator[Session, None, None]:
        with session_factory() as session:
            yield session

    with session_factory() as session:
        owner_id = session.scalar(
            text("SELECT owner_id FROM poi_maps WHERE id = :map_id"),
            {"map_id": args.map_id},
        )
        place_count = int(
            session.scalar(
                text("SELECT count(*) FROM places WHERE map_id = :map_id AND deleted_at IS NULL"),
                {"map_id": args.map_id},
            )
            or 0
        )
        selected_scenarios = scenarios(session, args.map_id, place_count)
    if owner_id is None:
        raise SystemExit(f"Map {args.map_id} does not exist")

    app.dependency_overrides[get_db] = database_override
    app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(id=owner_id, is_admin=False)
    try:
        client = TestClient(app)
        results = {
            name: benchmark_request(client, metrics, path, params, args.repeats)
            for name, path, params in selected_scenarios
        }
        plans = collect_plans(
            engine,
            args.map_id,
            limit=50,
            deep_offset=min(5000, max(0, place_count - 100)),
        )
    finally:
        app.dependency_overrides.pop(get_db, None)
        app.dependency_overrides.pop(get_current_user, None)
        event.remove(engine, "before_cursor_execute", metrics.before)
        event.remove(engine, "after_cursor_execute", metrics.after)
        engine.dispose()

    return {
        "database": database_name,
        "map_id": str(args.map_id),
        "place_count": place_count,
        "repeats": args.repeats,
        "metrics": results,
        "plans": plans,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--map-id", required=True, type=UUID)
    parser.add_argument("--database-url", default=os.getenv("DATABASE_URL"))
    parser.add_argument("--repeats", type=int, default=7)
    parser.add_argument("--output", type=Path)
    parser.add_argument(
        "--allow-read-replica",
        action="store_true",
        help="Allow a read replica whose database name lacks benchmark/test",
    )
    args = parser.parse_args()
    if not args.database_url:
        parser.error("--database-url or DATABASE_URL is required")
    if args.repeats < 3 or args.repeats > 50:
        parser.error("--repeats must be between 3 and 50")

    payload = run(args)
    rendered = json.dumps(payload, indent=2, ensure_ascii=False)
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(rendered + "\n", encoding="utf-8")
    print(rendered)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
