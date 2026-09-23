from __future__ import annotations

import importlib.util
import socket
import sys
import threading
import time
from argparse import Namespace
from pathlib import Path

import pytest

from app.config import s3_settings
from app.photos.object_storage import ObjectStorageError, S3ObjectStorage


pytestmark = pytest.mark.unit


RECOVERY_PATH = Path(__file__).resolve().parents[2] / "docker" / "s3_recovery.py"
RECOVERY_SPEC = importlib.util.spec_from_file_location("cartavault_s3_recovery", RECOVERY_PATH)
assert RECOVERY_SPEC is not None and RECOVERY_SPEC.loader is not None
s3_recovery = importlib.util.module_from_spec(RECOVERY_SPEC)
sys.modules[RECOVERY_SPEC.name] = s3_recovery
RECOVERY_SPEC.loader.exec_module(s3_recovery)


class Blackhole:
    def __init__(self) -> None:
        self.server = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        self.server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        self.server.bind(("127.0.0.1", 0))
        self.server.listen()
        self.server.settimeout(0.1)
        self.address = self.server.getsockname()
        self.stop_event = threading.Event()
        self.connections: list[socket.socket] = []
        self.thread = threading.Thread(target=self._run, daemon=True)

    def __enter__(self) -> "Blackhole":
        self.thread.start()
        return self

    def __exit__(self, *_args) -> None:
        self.stop_event.set()
        self.server.close()
        self.thread.join(timeout=2)
        for connection in self.connections:
            connection.close()

    def _run(self) -> None:
        while not self.stop_event.is_set():
            try:
                connection, _address = self.server.accept()
            except (OSError, TimeoutError):
                continue
            connection.settimeout(0.1)
            self.connections.append(connection)


def _configure_runtime_s3(monkeypatch: pytest.MonkeyPatch, endpoint: str) -> dict[str, int]:
    monkeypatch.setenv("MEDIA_STORAGE", "s3")
    monkeypatch.setenv("S3_BUCKET", "cartavault-test")
    monkeypatch.setenv("S3_ACCESS_KEY", "test-access")
    monkeypatch.setenv("S3_SECRET_KEY", "test-secret")
    monkeypatch.setenv("S3_ENDPOINT", endpoint)
    monkeypatch.setenv("S3_FORCE_PATH_STYLE", "true")
    previous: dict[str, int] = {
        "connect_timeout_seconds": s3_settings.connect_timeout_seconds,
        "read_timeout_seconds": s3_settings.read_timeout_seconds,
        "max_attempts": s3_settings.max_attempts,
        "operation_timeout_seconds": s3_settings.operation_timeout_seconds,
    }
    object.__setattr__(s3_settings, "connect_timeout_seconds", 1)
    object.__setattr__(s3_settings, "read_timeout_seconds", 1)
    object.__setattr__(s3_settings, "max_attempts", 1)
    object.__setattr__(s3_settings, "operation_timeout_seconds", 4)
    return previous


def _restore_runtime_s3(previous: dict[str, int]) -> None:
    for key, value in previous.items():
        object.__setattr__(s3_settings, key, value)


def test_runtime_s3_blackhole_fails_within_bound(monkeypatch: pytest.MonkeyPatch) -> None:
    with Blackhole() as blackhole:
        previous = _configure_runtime_s3(monkeypatch, f"http://{blackhole.address[0]}:{blackhole.address[1]}")
        try:
            started = time.monotonic()
            with pytest.raises(ObjectStorageError):
                S3ObjectStorage().stat("scope/photo.webp")
            elapsed = time.monotonic() - started
        finally:
            _restore_runtime_s3(previous)
    print(f"runtime S3 head blackhole elapsed={elapsed:.3f}s")
    assert elapsed < 6


def test_runtime_s3_connection_refusal_fails_quickly(monkeypatch: pytest.MonkeyPatch) -> None:
    refused = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    refused.bind(("127.0.0.1", 0))
    address = refused.getsockname()
    refused.close()
    previous = _configure_runtime_s3(monkeypatch, f"http://{address[0]}:{address[1]}")
    try:
        started = time.monotonic()
        with pytest.raises(ObjectStorageError):
            S3ObjectStorage().stat("scope/photo.webp")
        elapsed = time.monotonic() - started
        print(f"runtime S3 refusal elapsed={elapsed:.3f}s")
        assert elapsed < 3
    finally:
        _restore_runtime_s3(previous)


@pytest.mark.parametrize("operation", ["put", "materialize"])
def test_runtime_s3_data_operation_blackhole_fails_within_bound(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
    operation: str,
) -> None:
    with Blackhole() as blackhole:
        previous = _configure_runtime_s3(monkeypatch, f"http://{blackhole.address[0]}:{blackhole.address[1]}")
        try:
            backend = S3ObjectStorage()
            source = tmp_path / "photo.webp"
            source.write_bytes(b"candidate")
            started = time.monotonic()
            with pytest.raises(ObjectStorageError):
                if operation == "put":
                    backend.put("scope/photo.webp", source, content_type="image/webp")
                else:
                    backend.materialize("scope/photo.webp", tmp_path / "downloaded.webp")
            elapsed = time.monotonic() - started
        finally:
            _restore_runtime_s3(previous)
    print(f"runtime S3 {operation} blackhole elapsed={elapsed:.3f}s")
    assert elapsed < 6


def test_backup_inventory_blackhole_fails_without_completed_artifact(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    with Blackhole() as blackhole:
        monkeypatch.setenv("S3_BUCKET", "cartavault-test")
        monkeypatch.setenv("S3_ACCESS_KEY", "test-access")
        monkeypatch.setenv("S3_SECRET_KEY", "test-secret")
        monkeypatch.setenv("S3_ENDPOINT", f"http://{blackhole.address[0]}:{blackhole.address[1]}")
        monkeypatch.setenv("S3_FORCE_PATH_STYLE", "true")
        monkeypatch.setenv("S3_CONNECT_TIMEOUT_SECONDS", "1")
        monkeypatch.setenv("S3_READ_TIMEOUT_SECONDS", "1")
        monkeypatch.setenv("S3_MAX_ATTEMPTS", "1")
        monkeypatch.setenv("S3_OPERATION_TIMEOUT_SECONDS", "4")
        archive = tmp_path / "backup.tar.gz"
        started = time.monotonic()
        with pytest.raises(s3_recovery.RecoveryError):
            s3_recovery.command_backup(
                Namespace(
                    directory=str(tmp_path / "objects"),
                    archive=str(archive),
                    manifest=str(tmp_path / "manifest.jsonl"),
                )
            )
        elapsed = time.monotonic() - started
    assert elapsed < 6
    print(f"S3 recovery inventory blackhole elapsed={elapsed:.3f}s")
    assert not archive.exists()
    assert not (tmp_path / "objects").exists()
