"""Print PostgreSQL query plans for the principal place read paths.

Run only against a disposable benchmark database or a read replica. The script
does not create or modify data.
"""

from __future__ import annotations

import argparse
import os
from uuid import UUID

from sqlalchemy import create_engine, text


def explain(connection, label: str, statement: str, parameters: dict[str, object]) -> None:
    print(f"\n[{label}]")
    plan = connection.execute(
        text(f"EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT) {statement}"),
        parameters,
    ).scalars()
    print("\n".join(plan))


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--map-id", required=True, type=UUID)
    parser.add_argument("--database-url", default=os.getenv("DATABASE_URL"))
    parser.add_argument("--limit", type=int, default=100)
    parser.add_argument("--offset", type=int, default=0)
    args = parser.parse_args()
    if not args.database_url:
        parser.error("--database-url or DATABASE_URL is required")
    if args.limit < 1 or args.limit > 1000 or args.offset < 0:
        parser.error("limit must be 1..1000 and offset must be non-negative")

    parameters = {"map_id": args.map_id, "limit": args.limit, "offset": args.offset}
    engine = create_engine(args.database_url, pool_pre_ping=True)
    try:
        with engine.connect() as connection:
            explain(
                connection,
                "list page",
                """
                SELECT id, name, status_id
                FROM places
                WHERE map_id = :map_id AND deleted_at IS NULL
                ORDER BY lower(name), id
                LIMIT :limit OFFSET :offset
                """,
                parameters,
            )
            explain(
                connection,
                "facet base",
                """
                SELECT count(*)
                FROM places
                WHERE map_id = :map_id AND deleted_at IS NULL
                """,
                parameters,
            )
    finally:
        engine.dispose()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
