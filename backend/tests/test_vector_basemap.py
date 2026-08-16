from __future__ import annotations

import struct
from pathlib import Path
from types import SimpleNamespace

import httpx
import pytest
from sqlalchemy import text
from sqlalchemy.orm import Session
from starlette.testclient import TestClient

from app.auth.models import User
from app.basemaps import vector_generation, vector_service
from app.basemaps.vector_catalog import VECTOR_COUNTRY_CATALOG, vector_country_source
from app.basemaps.vector_generation import BasemapGenerationError, generate_vector_basemap, validate_pmtiles
from app.basemaps.vector_models import VectorBasemap
from app.basemaps.vector_service import archive_path, delete_vector_basemap, recover_vector_basemap_jobs, request_vector_basemap
from app.config import vector_basemap_settings
from app.countries.catalog import load_country_catalog
from app.tasks.models import BackgroundTask


def _pmtiles(path: Path, *, min_zoom: int = 0, max_zoom: int = 14) -> None:
    header = bytearray(127)
    header[:8] = b"PMTiles\x03"
    struct.pack_into("<QQ", header, 24, 127, 0)
    header[97] = 1
    header[99] = 1
    header[100] = min_zoom
    header[101] = max_zoom
    path.write_bytes(header + bytes(256))


@pytest.fixture
def vector_root(tmp_path: Path) -> Path:
    previous = vector_basemap_settings.maps_path
    object.__setattr__(vector_basemap_settings, "maps_path", tmp_path)
    try:
        yield tmp_path
    finally:
        object.__setattr__(vector_basemap_settings, "maps_path", previous)


@pytest.fixture
def france_basemap(database_session: Session, vector_root: Path) -> VectorBasemap:
    source = VECTOR_COUNTRY_CATALOG["FR"]
    archive = vector_root / source.filename
    _pmtiles(archive)
    row = VectorBasemap(
        country_code="FR", country_name="France", source_url=source.source_url,
        state="ready", phase="Disponible", version="fr-2026-08-15-omt-3.16",
        file_path=source.filename, file_size=archive.stat().st_size, min_zoom=0, max_zoom=14, schema="OpenMapTiles 3.16",
    )
    database_session.merge(row); database_session.commit()
    return database_session.get(VectorBasemap, "FR")


def test_controlled_geofabrik_catalog_maps_iso_codes() -> None:
    assert vector_country_source("fr").source_url == "https://download.geofabrik.de/europe/france-latest.osm.pbf"
    assert vector_country_source("GE").filename == "georgia.pmtiles"
    assert vector_country_source("MC").geofabrik_path == "europe/monaco-latest.osm.pbf"
    assert vector_country_source("XX") is None
    assert len(VECTOR_COUNTRY_CATALOG) == len(load_country_catalog()) == 250
    assert vector_country_source("JP").geofabrik_path == "asia/japan-latest.osm.pbf"
    assert vector_country_source("BR").geofabrik_path == "south-america/brazil-latest.osm.pbf"
    assert VECTOR_COUNTRY_CATALOG["AW"].supported is False


def test_vector_basemap_config_selects_country_archive(integration_client: TestClient, france_basemap: VectorBasemap) -> None:
    response = integration_client.get("/basemaps/cartavault/config", params={"country_code": "FR"})
    assert response.status_code == 200
    assert response.json()["available"] is True
    assert response.json()["version"] == "fr-2026-08-15-omt-3.16"
    assert response.json()["archive_url"] == "/basemaps/cartavault/archive/fr.pmtiles"


def test_vector_archive_supports_http_byte_ranges(integration_client: TestClient, france_basemap: VectorBasemap, vector_root: Path) -> None:
    archive = vector_root / "france.pmtiles"
    response = integration_client.get("/basemaps/cartavault/archive/fr.pmtiles", headers={"Range": "bytes=10-19"})
    assert response.status_code == 206
    assert response.content == archive.read_bytes()[10:20]
    assert response.headers["accept-ranges"] == "bytes"
    assert response.headers["content-range"] == f"bytes 10-19/{archive.stat().st_size}"
    head = integration_client.head("/basemaps/cartavault/archive/fr.pmtiles")
    assert head.status_code == 200
    assert head.content == b""


def test_vector_archive_rejects_multiple_ranges(integration_client: TestClient, france_basemap: VectorBasemap, vector_root: Path) -> None:
    response = integration_client.get("/basemaps/cartavault/archive/fr.pmtiles", headers={"Range": "bytes=0-1,4-5"})
    assert response.status_code == 416
    assert response.headers["content-range"] == f"bytes */{(vector_root / 'france.pmtiles').stat().st_size}"


def test_basemap_job_is_deduplicated_for_all_users(database_session: Session, auth_user: User, vector_root: Path) -> None:
    row, first = request_vector_basemap(database_session, "MC", auth_user.id, reason="manual_install")
    again_row, second = request_vector_basemap(database_session, "MC", auth_user.id, reason="manual_install")
    assert row is not None and again_row is not None
    assert first is not None and second is not None and first.id == second.id
    assert database_session.query(BackgroundTask).filter(BackgroundTask.dedupe_key == "vector-basemap:MC").count() == 1


def test_pmtiles_validation_rejects_raster_or_short_archive(tmp_path: Path) -> None:
    short = tmp_path / "short.pmtiles"; short.write_bytes(b"PMTiles")
    with pytest.raises(BasemapGenerationError, match="vide"):
        validate_pmtiles(short, 0, 14)
    raster = tmp_path / "raster.pmtiles"; _pmtiles(raster); data = bytearray(raster.read_bytes()); data[99] = 2; raster.write_bytes(data)
    with pytest.raises(BasemapGenerationError, match="vectorielles"):
        validate_pmtiles(raster, 0, 14)


def test_generation_activates_atomically_and_removes_pbf(monkeypatch: pytest.MonkeyPatch, database_session: Session, auth_user: User, vector_root: Path) -> None:
    row, task = request_vector_basemap(database_session, "MC", auth_user.id, reason="manual_install")
    assert row is not None and task is not None
    monkeypatch.setattr(vector_generation, "_source_metadata", lambda _url: (1024, None))
    monkeypatch.setattr(vector_generation, "_check_disk", lambda _root, _size: None)
    monkeypatch.setattr(vector_generation, "_check_planetiler_runtime", lambda: None)
    monkeypatch.setattr(vector_generation, "_download", lambda _url, _part, final, _size, _progress: final.write_bytes(b"pbf"))
    planetiler_work: list[Path] = []
    monkeypatch.setattr(vector_generation, "_run_planetiler", lambda _pbf, output, work, _policy, _task_id=None, _progress=None: planetiler_work.append(work) or _pmtiles(output))
    result = generate_vector_basemap(database_session, task, lambda *_args: None)
    database_session.refresh(row)
    assert result["country_code"] == "MC"
    assert row.state == "ready" and row.version.startswith("mc-")
    assert (vector_root / "monaco.pmtiles").is_file()
    assert planetiler_work == [vector_root / "work" / "monaco"]
    assert not (vector_root / "work" / "monaco" / "monaco.osm.pbf").exists()


def test_failed_update_keeps_previous_archive(monkeypatch: pytest.MonkeyPatch, database_session: Session, auth_user: User, vector_root: Path) -> None:
    source = VECTOR_COUNTRY_CATALOG["MC"]
    old = vector_root / source.filename; old.write_bytes(b"existing-valid-basemap")
    database_session.merge(VectorBasemap(country_code="MC", country_name="Monaco", source_url=source.source_url, state="ready", phase="Disponible", version="old", file_path=source.filename, file_size=old.stat().st_size, min_zoom=0, max_zoom=14, schema="OpenMapTiles 3.16")); database_session.commit()
    row, task = request_vector_basemap(database_session, "MC", auth_user.id, reason="manual_update", force=True)
    assert row is not None and task is not None
    monkeypatch.setattr(vector_generation, "_source_metadata", lambda _url: (1024, None))
    monkeypatch.setattr(vector_generation, "_check_disk", lambda _root, _size: None)
    monkeypatch.setattr(vector_generation, "_check_planetiler_runtime", lambda: None)
    monkeypatch.setattr(vector_generation, "_download", lambda _url, _part, final, _size, _progress: final.write_bytes(b"pbf"))
    monkeypatch.setattr(vector_generation, "_run_planetiler", lambda *_args, **_kwargs: (_ for _ in ()).throw(BasemapGenerationError("GENERATION_FAILED", "Échec contrôlé")))
    with pytest.raises(BasemapGenerationError):
        generate_vector_basemap(database_session, task, lambda *_args: None)
    assert old.read_bytes() == b"existing-valid-basemap"
    database_session.refresh(row)
    assert row.state == "error" and row.last_error_code == "GENERATION_FAILED"
    assert archive_path(row) == old


def test_download_failure_removes_partial_file(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    part = tmp_path / "monaco.osm.pbf.part"
    final = tmp_path / "monaco.osm.pbf"
    monkeypatch.setattr(httpx, "stream", lambda *_args, **_kwargs: (_ for _ in ()).throw(httpx.ConnectError("offline")))
    with pytest.raises(BasemapGenerationError) as caught:
        vector_generation._download("https://download.geofabrik.de/europe/monaco-latest.osm.pbf", part, final, None, lambda *_args: None)
    assert caught.value.code == "DOWNLOAD_FAILED"
    assert not part.exists() and not final.exists()


def test_disk_check_refuses_insufficient_space(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    monkeypatch.setattr(vector_generation.shutil, "disk_usage", lambda _path: SimpleNamespace(free=1024))
    with pytest.raises(BasemapGenerationError) as caught:
        vector_generation._check_disk(tmp_path, 1024 * 1024)
    assert caught.value.code == "INSUFFICIENT_DISK"


def test_planetiler_preflight_runs_before_country_download(monkeypatch: pytest.MonkeyPatch, database_session: Session, auth_user: User, vector_root: Path) -> None:
    row, task = request_vector_basemap(database_session, "MC", auth_user.id, reason="manual_install")
    assert row is not None and task is not None
    monkeypatch.setattr(
        vector_generation,
        "_check_planetiler_runtime",
        lambda: (_ for _ in ()).throw(BasemapGenerationError("PLANETILER_UNAVAILABLE", "Runtime absent")),
    )
    monkeypatch.setattr(vector_generation, "_download", lambda *_args: pytest.fail("download must not start"))
    with pytest.raises(BasemapGenerationError) as caught:
        generate_vector_basemap(database_session, task, lambda *_args: None)
    assert caught.value.code == "PLANETILER_UNAVAILABLE"


def test_planetiler_preflight_uses_configured_java_executable(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    jar = tmp_path / "planetiler.jar"
    jar.write_bytes(b"jar")
    configured_java = str(tmp_path / "java21" / "bin" / "java.exe")
    calls: list[list[str]] = []
    monkeypatch.setattr(
        vector_generation.subprocess,
        "run",
        lambda arguments, **_kwargs: calls.append(arguments) or SimpleNamespace(
            returncode=0,
            stderr='openjdk version "21.0.12"',
            stdout="",
        ),
    )
    previous_jar = vector_basemap_settings.planetiler_jar
    previous_java = vector_basemap_settings.java_executable
    object.__setattr__(vector_basemap_settings, "planetiler_jar", jar)
    object.__setattr__(vector_basemap_settings, "java_executable", configured_java)
    try:
        vector_generation._check_planetiler_runtime()
    finally:
        object.__setattr__(vector_basemap_settings, "planetiler_jar", previous_jar)
        object.__setattr__(vector_basemap_settings, "java_executable", previous_java)
    assert calls == [[configured_java, "-version"]]


def test_planetiler_uses_executable_workdir_for_native_libraries(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    calls: list[list[str]] = []

    class CompletedProcess:
        returncode = 0

        @staticmethod
        def poll() -> int:
            return 0

    monkeypatch.setattr(vector_generation, "_check_planetiler_runtime", lambda: None)
    monkeypatch.setattr(
        vector_generation.subprocess,
        "Popen",
        lambda arguments, **_kwargs: calls.append(arguments) or CompletedProcess(),
    )
    work = tmp_path / "work"
    work.mkdir()
    vector_generation._run_planetiler(
        tmp_path / "source.osm.pbf",
        work / "output.tmp.pmtiles",
        work,
        SimpleNamespace(max_zoom=14),
    )

    native_tmp = work / "native-tmp"
    assert native_tmp.is_dir()
    assert f"-Dorg.sqlite.tmpdir={native_tmp}" in calls[0]
    assert f"-Djava.io.tmpdir={native_tmp}" in calls[0]
    assert calls[0].index(f"-Dorg.sqlite.tmpdir={native_tmp}") < calls[0].index("-jar")


def test_planetiler_log_progress_tracks_generation_stages_monotonically() -> None:
    parser = vector_generation._PlanetilerProgressParser()
    assert parser.feed("0:00:04 INF [water_polygons] - Starting...") == 3
    assert parser.feed("0:00:21 INF [water_polygons] - read: [ 5k 50% 500/s ]") == 5
    assert parser.feed("0:00:30 INF [water_polygons] - Finished in 24s") == 8
    assert parser.feed("0:00:42 INF [osm_pass1] - Starting...") == 12
    assert parser.feed("read(70 %) -> process(40\u00a0% 42\u00a0% 38\u00a0%)") == 21
    assert parser.feed("0:10:00 INF [archive] - features: [ 3M 50\u00a0% 1M/s ]") == 87
    assert parser.feed("0:10:10 INF [archive] - features: [ 4M 40% 1M/s ]") == 87
    assert parser.feed("0:11:00 INF [archive:write] - Finished z14 in 2s") == 87


def test_generation_lock_survives_handler_session_commits(monkeypatch: pytest.MonkeyPatch, database_session: Session) -> None:
    contender_results: list[bool] = []

    def fake_generation(session: Session, _task: object, _progress: object) -> dict[str, bool]:
        session.commit()
        bind = session.get_bind()
        engine = bind.engine if hasattr(bind, "engine") else bind
        with engine.connect() as contender:
            contender_results.append(bool(contender.scalar(text(
                "SELECT pg_try_advisory_lock(:key)",
            ), {"key": vector_generation._GLOBAL_GENERATION_LOCK})))
        return {"ok": True}

    monkeypatch.setattr(vector_generation, "_generate_vector_basemap_locked", fake_generation)
    result = vector_generation.generate_vector_basemap(database_session, object(), lambda *_args: None)
    assert result == {"ok": True}
    assert contender_results == [False]

    bind = database_session.get_bind()
    engine = bind.engine if hasattr(bind, "engine") else bind
    with engine.connect() as contender:
        assert contender.scalar(text("SELECT pg_try_advisory_lock(:key)"), {"key": vector_generation._GLOBAL_GENERATION_LOCK}) is True
        contender.execute(text("SELECT pg_advisory_unlock(:key)"), {"key": vector_generation._GLOBAL_GENERATION_LOCK})


def test_automatic_preparation_stays_idle_when_runtime_is_unavailable(monkeypatch: pytest.MonkeyPatch, database_session: Session, auth_user: User, vector_root: Path) -> None:
    monkeypatch.setattr(
        vector_service,
        "_check_planetiler_runtime",
        lambda: (_ for _ in ()).throw(BasemapGenerationError("PLANETILER_UNAVAILABLE", "Runtime absent")),
    )
    before = database_session.query(BackgroundTask).filter(BackgroundTask.dedupe_key == "vector-basemap:MC").count()
    row = vector_service.maybe_prepare_for_policy(database_session, "MC", auth_user.id, "cartavault_use")
    after = database_session.query(BackgroundTask).filter(BackgroundTask.dedupe_key == "vector-basemap:MC").count()
    assert row is not None and row.state == "not_installed"
    assert after == before


def test_unsupported_catalog_country_is_exposed_without_starting_a_job(database_session: Session, auth_user: User, vector_root: Path) -> None:
    row = vector_service.maybe_prepare_for_policy(database_session, "AW", auth_user.id, "cartavault_use")
    assert row is None
    assert database_session.query(BackgroundTask).filter(BackgroundTask.dedupe_key == "vector-basemap:AW").count() == 0


def test_delete_removes_archive_but_keeps_catalog_row(database_session: Session, france_basemap: VectorBasemap, vector_root: Path) -> None:
    assert delete_vector_basemap(database_session, "FR") == 0
    database_session.refresh(france_basemap)
    assert france_basemap.state == "not_installed"
    assert france_basemap.file_path is None
    assert not (vector_root / "france.pmtiles").exists()


def test_recovery_marks_interrupted_generation(database_session: Session, auth_user: User, vector_root: Path) -> None:
    row, task = request_vector_basemap(database_session, "MC", auth_user.id, reason="manual_install")
    assert row is not None and task is not None
    row.state = "generating"
    task.status = "running"
    database_session.commit()
    recover_vector_basemap_jobs(database_session)
    database_session.refresh(row); database_session.refresh(task)
    assert row.state == "error" and row.last_error_code == "INTERRUPTED"
    assert task.status == "failed" and task.error_code == "INTERRUPTED"


def test_admin_can_persist_policy_and_reject_unknown_country(integration_client: TestClient) -> None:
    payload = {
        "enabled": True, "preparation_policy": "manual", "update_policy": "quarterly",
        "min_zoom": 0, "max_zoom": 14, "offline_min_zoom": 6, "offline_max_zoom": 13,
        "offline_padding_km": 30, "offline_max_tiles": 20000,
    }
    saved = integration_client.put("/admin/console/vector-basemaps/settings", json=payload)
    assert saved.status_code == 200
    assert saved.json()["preparation_policy"] == "manual"
    library = integration_client.get("/admin/console/vector-basemaps")
    assert library.status_code == 200
    assert library.json()["settings"]["offline_padding_km"] == 30
    unsupported = integration_client.post("/admin/console/vector-basemaps/XX/install")
    assert unsupported.status_code == 422


def test_vector_admin_endpoints_require_admin(integration_client: TestClient, auth_user: User) -> None:
    auth_user.is_admin = False
    response = integration_client.get("/admin/console/vector-basemaps")
    assert response.status_code == 403
