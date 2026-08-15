from __future__ import annotations

import gzip
import json
import logging
import os
import re
import shutil
import struct
import subprocess
import time
from datetime import UTC, datetime
from email.utils import parsedate_to_datetime
from pathlib import Path
from uuid import UUID

import httpx
from sqlalchemy import select, text, update
from sqlalchemy.orm import Session

from app.basemaps.vector_catalog import vector_country_source
from app.basemaps.vector_models import VectorBasemap
from app.basemaps.vector_settings import get_vector_basemap_policy
from app.config import vector_basemap_settings
from app.tasks.models import BackgroundTask
from app.database import SessionLocal
from app.tasks.registry import ProgressCallback, task_handler
from app.tasks.service import TaskCancelled


logger = logging.getLogger(__name__)
VECTOR_BASEMAP_TASK = "vector_basemap_prepare"
_GLOBAL_GENERATION_LOCK = 0x43415642  # "CAVB", shared across backend workers.
_EXPECTED_LAYERS = {"transportation", "water", "place"}
_PLANETILER_STAGE_RANGES = {
    "lake_centerlines": (0, 3),
    "water_polygons": (3, 8),
    "natural_earth": (8, 12),
    "osm_pass1": (12, 35),
    "osm_pass2": (35, 65),
    "sort": (65, 75),
    "archive": (75, 99),
}


class BasemapGenerationError(RuntimeError):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code


class _PlanetilerProgressParser:
    """Turn Planetiler's periodic text report into monotonic progress."""

    def __init__(self) -> None:
        self.stage: str | None = None
        self.percent = 0

    def feed(self, output: str) -> int:
        for line in output.replace("\r", "\n").splitlines():
            stage_match = re.search(r"\[([a-z0-9_]+)\]\s+-\s+(Starting(?:\.\.\.)?|Finished in\b)", line)
            if stage_match and stage_match.group(1) in _PLANETILER_STAGE_RANGES:
                stage = stage_match.group(1)
                start, end = _PLANETILER_STAGE_RANGES[stage]
                self.stage = stage
                self.percent = max(self.percent, end if stage_match.group(2).startswith("Finished") else start)
                continue

            archive_match = re.search(r"\[archive\]\s+-\s+features:\s*\[[^]]*?\b(\d{1,3})\s*%", line)
            if archive_match:
                self.stage = "archive"
                start, end = _PLANETILER_STAGE_RANGES["archive"]
                value = min(100, int(archive_match.group(1)))
                self.percent = max(self.percent, start + round((end - start) * value / 100))
                continue

            if self.stage in _PLANETILER_STAGE_RANGES:
                process_match = re.search(r"process\(([^)]*)\)", line)
                progress_text = process_match.group(1) if process_match else line
                values = [int(value) for value in re.findall(r"(?<![-\d])(\d{1,3})\s*%", progress_text) if int(value) <= 100]
                if values:
                    values.sort()
                    stage_value = values[len(values) // 2]
                    start, end = _PLANETILER_STAGE_RANGES[self.stage]
                    self.percent = max(self.percent, start + round((end - start) * stage_value / 100))
        return min(self.percent, 99)


def _now() -> datetime:
    return datetime.now(UTC).replace(tzinfo=None)


def _set_state(session: Session, country_code: str, state: str, phase: str, *, progress: int | None = None) -> None:
    session.execute(update(VectorBasemap).where(VectorBasemap.country_code == country_code).values(
        state=state, phase=phase, progress=progress, updated_at=_now(),
    ))
    session.commit()


def _source_metadata(source_url: str) -> tuple[int | None, datetime | None]:
    try:
        with httpx.Client(follow_redirects=True, timeout=30) as client:
            response = client.head(source_url)
            response.raise_for_status()
        size = int(response.headers["content-length"]) if response.headers.get("content-length", "").isdigit() else None
        modified = parsedate_to_datetime(response.headers["last-modified"]).astimezone(UTC).replace(tzinfo=None) if response.headers.get("last-modified") else None
        return size, modified
    except (httpx.HTTPError, ValueError, OverflowError):
        return None, None


def _check_disk(root: Path, source_size: int | None) -> None:
    root.mkdir(parents=True, exist_ok=True)
    free = shutil.disk_usage(root).free
    # Planetiler documents 5–10x PBF size; keep headroom for source, output and
    # sorting files. Unknown sources require at least 2 GiB free.
    required = max(2 * 1024**3, (source_size or 0) * 12)
    if free < required:
        raise BasemapGenerationError("INSUFFICIENT_DISK", "Espace insuffisant pour préparer ce fond CartaVault.")


def _check_planetiler_runtime() -> None:
    """Fail before downloading a potentially multi-gigabyte country extract."""
    jar = vector_basemap_settings.planetiler_jar
    if not jar.is_file():
        raise BasemapGenerationError(
            "PLANETILER_UNAVAILABLE",
            "Le générateur cartographique n’est pas disponible sur cette installation CartaVault.",
        )
    try:
        result = subprocess.run(
            [vector_basemap_settings.java_executable, "-version"],
            check=False,
            capture_output=True,
            text=True,
            timeout=10,
        )
    except (OSError, subprocess.TimeoutExpired) as error:
        raise BasemapGenerationError(
            "PLANETILER_UNAVAILABLE",
            "Java 21 ou supérieur est requis pour préparer les fonds CartaVault.",
        ) from error
    version_output = f"{result.stderr}\n{result.stdout}"
    match = re.search(r'version\s+"(?:1\.)?(\d+)', version_output)
    if result.returncode != 0 or match is None or int(match.group(1)) < 21:
        raise BasemapGenerationError(
            "PLANETILER_UNAVAILABLE",
            "Java 21 ou supérieur est requis pour préparer les fonds CartaVault.",
        )


def _download(source_url: str, part_path: Path, final_path: Path, expected_size: int | None, progress: ProgressCallback) -> None:
    part_path.unlink(missing_ok=True)
    downloaded = 0
    try:
        timeout = httpx.Timeout(vector_basemap_settings.download_timeout_seconds, connect=30)
        with httpx.stream("GET", source_url, follow_redirects=True, timeout=timeout) as response:
            response.raise_for_status()
            total = expected_size or int(response.headers.get("content-length", "0") or 0)
            with part_path.open("wb") as target:
                for chunk in response.iter_bytes(1024 * 1024):
                    if not chunk:
                        continue
                    target.write(chunk)
                    downloaded += len(chunk)
                    progress(min(downloaded, total or downloaded), max(1, total or downloaded + 1), "Téléchargement des données OSM")
                target.flush()
                os.fsync(target.fileno())
        if downloaded <= 0 or (expected_size and downloaded != expected_size):
            raise BasemapGenerationError("DOWNLOAD_FAILED", "Le téléchargement des données OpenStreetMap est incomplet.")
        os.replace(part_path, final_path)
    except BasemapGenerationError:
        part_path.unlink(missing_ok=True)
        raise
    except (httpx.HTTPError, OSError) as error:
        part_path.unlink(missing_ok=True)
        raise BasemapGenerationError("DOWNLOAD_FAILED", "Le téléchargement des données OpenStreetMap a échoué.") from error


def _run_planetiler(
    pbf_path: Path,
    output_tmp: Path,
    work_path: Path,
    policy,
    task_id: UUID | None = None,
    progress: ProgressCallback | None = None,
) -> None:
    _check_planetiler_runtime()
    jar = vector_basemap_settings.planetiler_jar
    output_tmp.unlink(missing_ok=True)
    arguments = [
        vector_basemap_settings.java_executable,
        f"-Xmx{vector_basemap_settings.java_heap}", "-XX:MaxHeapFreeRatio=40", "-jar", str(jar),
        f"--osm-path={pbf_path}", f"--output={output_tmp}", f"--tmpdir={work_path / 'planetiler'}",
        f"--download-dir={work_path.parent / 'sources'}",
        f"--maxzoom={policy.max_zoom}", "--tile-format=mvt", "--download", "--force",
    ]
    log_path = work_path / "planetiler.log"
    parser = _PlanetilerProgressParser()
    log_offset = 0
    try:
        # Planetiler is verbose. Writing to a file avoids filling subprocess
        # pipes and deadlocking long country generations.
        with log_path.open("w", encoding="utf-8", errors="replace") as log_file:
            process = subprocess.Popen(arguments, shell=False, stdout=log_file, stderr=subprocess.STDOUT, text=True)
            while process.poll() is None:
                try:
                    with log_path.open("r", encoding="utf-8", errors="replace") as progress_log:
                        progress_log.seek(log_offset)
                        output = progress_log.read()
                        log_offset = progress_log.tell()
                    parsed_percent = parser.feed(output)
                    if progress is not None and parsed_percent > 0:
                        progress(parsed_percent, 100, "Génération du fond")
                except OSError:
                    pass
                if task_id is not None:
                    with SessionLocal() as check_session:
                        cancelled = check_session.scalar(select(BackgroundTask.cancel_requested_at).where(BackgroundTask.id == task_id))
                    if cancelled is not None:
                        process.terminate()
                        try:
                            process.wait(timeout=15)
                        except subprocess.TimeoutExpired:
                            process.kill()
                        raise TaskCancelled
                time.sleep(1)
    except OSError as error:
        raise BasemapGenerationError("GENERATION_FAILED", "Planetiler n’a pas pu démarrer.") from error
    if process.returncode != 0:
        try:
            log_tail = log_path.read_text(encoding="utf-8", errors="replace")[-5000:]
        except OSError:
            log_tail = ""
        logger.error("Planetiler failed returncode=%s output=%s", process.returncode, log_tail)
        raise BasemapGenerationError("GENERATION_FAILED", "La génération du fond CartaVault a échoué.")
    if progress is not None:
        progress(100, 100, "Génération du fond")


def validate_pmtiles(path: Path, configured_min: int, configured_max: int) -> dict[str, object]:
    if not path.is_file() or path.stat().st_size <= 127:
        raise BasemapGenerationError("PMTILES_INVALID", "L’archive PMTiles générée est vide ou incomplète.")
    with path.open("rb") as source:
        header = source.read(127)
        if header[:7] != b"PMTiles" or header[7] != 3:
            raise BasemapGenerationError("PMTILES_INVALID", "L’en-tête PMTiles est invalide.")
        metadata_offset, metadata_length = struct.unpack_from("<QQ", header, 24)
        internal_compression, tile_type = header[97], header[99]
        min_zoom, max_zoom = header[100], header[101]
        if tile_type != 1:
            raise BasemapGenerationError("PMTILES_INVALID", "Le fond généré ne contient pas de tuiles vectorielles MVT.")
        if min_zoom > configured_min or max_zoom < configured_max:
            raise BasemapGenerationError("PMTILES_INVALID", "La plage de zoom du fond généré est insuffisante.")
        metadata: dict[str, object] = {}
        if 0 < metadata_length <= 16 * 1024 * 1024:
            source.seek(metadata_offset)
            payload = source.read(metadata_length)
            if internal_compression == 2:
                payload = gzip.decompress(payload)
            if internal_compression in {1, 2}:
                try:
                    metadata = json.loads(payload)
                except (json.JSONDecodeError, UnicodeDecodeError, OSError):
                    metadata = {}
    vector_layers = {str(item.get("id")) for item in metadata.get("vector_layers", []) if isinstance(item, dict)}
    if vector_layers and not _EXPECTED_LAYERS.issubset(vector_layers):
        raise BasemapGenerationError("PMTILES_INVALID", "Le fond ne contient pas les couches OpenMapTiles principales attendues.")
    return {"min_zoom": min_zoom, "max_zoom": max_zoom, "metadata": metadata}


def _version(country_code: str, source_date: datetime | None) -> str:
    stamp = (source_date or _now()).strftime("%Y-%m-%d")
    return f"{country_code.lower()}-{stamp}-omt-3.16"


@task_handler(VECTOR_BASEMAP_TASK)
def generate_vector_basemap(session: Session, task: BackgroundTask, progress: ProgressCallback) -> dict[str, object]:
    # Keep a dedicated connection checked out for the entire job. The handler
    # session commits progress regularly, which would otherwise return its
    # connection (and its session-level advisory lock) to the pool.
    bind = session.get_bind()
    lock_engine = bind.engine if hasattr(bind, "engine") else bind
    lock_connection = lock_engine.connect()
    try:
        lock_connection.execute(text("SELECT pg_advisory_lock(:key)"), {"key": _GLOBAL_GENERATION_LOCK})
        return _generate_vector_basemap_locked(session, task, progress)
    finally:
        try:
            lock_connection.execute(text("SELECT pg_advisory_unlock(:key)"), {"key": _GLOBAL_GENERATION_LOCK})
        finally:
            lock_connection.close()


def _generate_vector_basemap_locked(session: Session, task: BackgroundTask, progress: ProgressCallback) -> dict[str, object]:
    country_code = str(task.input_json.get("country_code", "")).upper()
    source = vector_country_source(country_code)
    if source is None:
        raise BasemapGenerationError("UNSUPPORTED_COUNTRY", "Fond automatique non disponible pour ce pays.")
    logger.info("vector_basemap country=%s job_id=%s phase=queued source=%s", country_code, task.id, source.source_url)
    started = time.monotonic()
    root = vector_basemap_settings.maps_path.resolve()
    work_root = (root / "work").resolve()
    work = (work_root / source.slug).resolve()
    final_path = (root / source.filename).resolve()
    pbf = (work / f"{source.slug}.osm.pbf").resolve()
    part = (work / f"{source.slug}.osm.pbf.part").resolve()
    # Planetiler infers the archive format from the final suffix, therefore the
    # temporary name must still end in .pmtiles.
    output_tmp = (work / f"{source.slug}.tmp.pmtiles").resolve()
    if root not in final_path.parents or root not in work.parents or root not in work_root.parents:
        raise BasemapGenerationError("INVALID_PATH", "Chemin cartographique invalide.")
    row = session.get(VectorBasemap, country_code)
    try:
        work.mkdir(parents=True, exist_ok=True)
        # Reuse a source downloaded by a version that stored all temporary
        # files directly in work/, before per-country isolation was added.
        legacy_pbf = work_root / f"{source.slug}.osm.pbf"
        if legacy_pbf.is_file() and not pbf.exists():
            os.replace(legacy_pbf, pbf)
        policy = get_vector_basemap_policy(session)
        _check_planetiler_runtime()
        source_size, source_date = _source_metadata(source.source_url)
        _check_disk(root, source_size)
        if row is None:
            raise BasemapGenerationError("BASEMAP_NOT_FOUND", "Le fond demandé n’existe plus.")
        row.generation_started_at = _now(); row.task_id = task.id; row.source_size = source_size
        row.last_error_code = None; row.last_error_message = None
        session.commit()

        if task.input_json.get("reason") == "automatic_update" and source_date and row.source_date and source_date <= row.source_date and final_path.is_file():
            row.state = "ready"; row.phase = "Disponible"; row.progress = 100; row.generation_finished_at = _now()
            session.commit()
            return {"country_code": country_code, "version": row.version, "unchanged": True}

        _set_state(session, country_code, "downloading", "Téléchargement des données OSM")
        progress(0, max(1, source_size or 1), "Téléchargement des données OSM")
        if source_size is not None and pbf.is_file() and pbf.stat().st_size == source_size:
            progress(source_size, source_size, "Données OSM déjà téléchargées")
        else:
            _download(source.source_url, part, pbf, source_size, progress)

        _set_state(session, country_code, "generating", "Génération du fond")
        progress(0, 1, "Génération du fond")
        _run_planetiler(pbf, output_tmp, work, policy, task.id, progress)

        _set_state(session, country_code, "validating", "Validation du fond")
        progress(0, 1, "Validation du fond")
        inspected = validate_pmtiles(output_tmp, policy.min_zoom, policy.max_zoom)

        # os.replace is atomic on the persistent volume and leaves the previous
        # archive untouched until validation has completed.
        os.replace(output_tmp, final_path)
        row = session.get(VectorBasemap, country_code)
        assert row is not None
        row.state = "ready"; row.phase = "Disponible"; row.progress = 100
        row.installed_at = _now(); row.generation_finished_at = _now(); row.source_date = source_date or _now()
        row.version = _version(country_code, row.source_date); row.file_path = source.filename
        row.file_size = final_path.stat().st_size; row.min_zoom = int(inspected["min_zoom"]); row.max_zoom = int(inspected["max_zoom"])
        row.schema = "OpenMapTiles 3.16"; row.last_error_code = None; row.last_error_message = None
        session.commit()
        pbf.unlink(missing_ok=True)
        logger.info("vector_basemap country=%s job_id=%s phase=complete duration=%.1f result=ready", country_code, task.id, time.monotonic() - started)
        return {"country_code": country_code, "version": row.version, "file_size": row.file_size}
    except TaskCancelled:
        output_tmp.unlink(missing_ok=True); part.unlink(missing_ok=True)
        row = session.get(VectorBasemap, country_code)
        if row is not None:
            row.state = "error"; row.phase = "Annulé"; row.progress = None
            row.last_error_code = "CANCELLED"; row.last_error_message = "La préparation du fond a été annulée."
            row.generation_finished_at = _now()
            session.commit()
        logger.info("vector_basemap country=%s job_id=%s phase=cancelled duration=%.1f result=cancelled", country_code, task.id, time.monotonic() - started)
        raise
    except BasemapGenerationError as error:
        output_tmp.unlink(missing_ok=True); part.unlink(missing_ok=True)
        row = session.get(VectorBasemap, country_code)
        if row is not None:
            row.state = "error"; row.phase = "Erreur"; row.progress = None
            row.last_error_code = error.code; row.last_error_message = str(error); row.generation_finished_at = _now()
            session.commit()
        logger.error("vector_basemap country=%s job_id=%s phase=failed duration=%.1f result=error error_code=%s", country_code, task.id, time.monotonic() - started, error.code)
        raise
    except Exception as error:
        output_tmp.unlink(missing_ok=True); part.unlink(missing_ok=True)
        row = session.get(VectorBasemap, country_code)
        if row is not None:
            row.state = "error"; row.phase = "Erreur"; row.progress = None
            row.last_error_code = "GENERATION_FAILED"; row.last_error_message = "La génération du fond CartaVault a échoué."
            row.generation_finished_at = _now()
            session.commit()
        logger.exception("vector_basemap country=%s job_id=%s phase=failed duration=%.1f result=error error_code=GENERATION_FAILED", country_code, task.id, time.monotonic() - started)
        raise BasemapGenerationError("GENERATION_FAILED", "La génération du fond CartaVault a échoué.") from error
    finally:
        session.execute(text("SELECT pg_advisory_unlock(:key)"), {"key": _GLOBAL_GENERATION_LOCK})
        session.commit()
