from __future__ import annotations

import os
from pathlib import Path
from pathlib import PurePosixPath
from threading import Lock
from typing import Protocol
from uuid import uuid4

import boto3
from botocore.client import Config
from botocore.exceptions import BotoCoreError, ClientError


class ObjectStorageError(RuntimeError):
    pass


class ObjectStorageBackend(Protocol):
    def put(self, key: str, source: Path, *, content_type: str) -> None: ...
    def materialize(self, key: str, destination: Path) -> bool: ...
    def delete(self, key: str) -> bool: ...


class LocalObjectStorage:
    """The existing filesystem backend; files are already materialized."""

    def put(self, key: str, source: Path, *, content_type: str) -> None:
        del key, content_type
        if not source.is_file():
            raise ObjectStorageError("The local media file is missing")

    def materialize(self, key: str, destination: Path) -> bool:
        del key
        return destination.is_file()

    def delete(self, key: str) -> bool:
        del key
        return False


class S3ObjectStorage:
    """Private S3-compatible object storage with a disposable local cache."""

    def __init__(self) -> None:
        bucket = os.getenv("S3_BUCKET", "").strip()
        if not bucket:
            raise ObjectStorageError("S3_BUCKET is required when MEDIA_STORAGE=s3")
        access_key = os.getenv("S3_ACCESS_KEY", "").strip()
        secret_key = os.getenv("S3_SECRET_KEY", "").strip()
        if not access_key or not secret_key:
            raise ObjectStorageError("S3_ACCESS_KEY and S3_SECRET_KEY are required")
        self.bucket = bucket
        self.prefix = os.getenv("S3_PREFIX", "media").strip().strip("/")
        endpoint = os.getenv("S3_ENDPOINT", "").strip() or None
        region = os.getenv("S3_REGION", "us-east-1").strip()
        addressing_style = "path" if _boolean("S3_FORCE_PATH_STYLE", False) else "auto"
        self.client = boto3.client(
            "s3",
            endpoint_url=endpoint,
            region_name=region,
            aws_access_key_id=access_key,
            aws_secret_access_key=secret_key,
            use_ssl=_boolean("S3_USE_SSL", True),
            verify=_boolean("S3_VERIFY_TLS", True),
            config=Config(signature_version="s3v4", s3={"addressing_style": addressing_style}),
        )

    def _key(self, key: str) -> str:
        path = PurePosixPath(key)
        if path.is_absolute() or not path.parts or any(part in {"", ".", ".."} for part in path.parts):
            raise ObjectStorageError("Invalid S3 media object key")
        normalized = path.as_posix()
        return f"{self.prefix}/{normalized}" if self.prefix else normalized

    def put(self, key: str, source: Path, *, content_type: str) -> None:
        try:
            self.client.upload_file(
                str(source),
                self.bucket,
                self._key(key),
                ExtraArgs={"ContentType": content_type},
            )
        except (BotoCoreError, ClientError, OSError) as error:
            raise ObjectStorageError("Unable to store media in S3") from error

    def materialize(self, key: str, destination: Path) -> bool:
        temporary = destination.with_name(f".{destination.name}.{uuid4().hex}.download")
        try:
            destination.parent.mkdir(parents=True, exist_ok=True)
            self.client.download_file(self.bucket, self._key(key), str(temporary))
            temporary.replace(destination)
            return True
        except ClientError as error:
            temporary.unlink(missing_ok=True)
            status = error.response.get("ResponseMetadata", {}).get("HTTPStatusCode")
            code = error.response.get("Error", {}).get("Code")
            if status == 404 or code in {"404", "NoSuchKey", "NotFound"}:
                return False
            raise ObjectStorageError("Unable to read media from S3") from error
        except (BotoCoreError, OSError) as error:
            temporary.unlink(missing_ok=True)
            raise ObjectStorageError("Unable to read media from S3") from error

    def delete(self, key: str) -> bool:
        try:
            self.client.delete_object(Bucket=self.bucket, Key=self._key(key))
            return True
        except (BotoCoreError, ClientError) as error:
            raise ObjectStorageError("Unable to delete media from S3") from error


def _boolean(name: str, default: bool) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    normalized = value.strip().lower()
    if normalized in {"1", "true", "yes", "on"}:
        return True
    if normalized in {"0", "false", "no", "off"}:
        return False
    raise ObjectStorageError(f"{name} must be a boolean")


def media_storage_mode() -> str:
    mode = os.getenv("MEDIA_STORAGE", "local").strip().lower()
    if mode not in {"local", "s3"}:
        raise ObjectStorageError("MEDIA_STORAGE must be local or s3")
    return mode


def build_object_storage() -> ObjectStorageBackend:
    mode = media_storage_mode()
    if os.getenv("PYTEST_CURRENT_TEST"):
        return S3ObjectStorage() if mode == "s3" else LocalObjectStorage()
    signature = (
        mode,
        os.getenv("S3_ENDPOINT", ""),
        os.getenv("S3_REGION", ""),
        os.getenv("S3_BUCKET", ""),
        os.getenv("S3_ACCESS_KEY", ""),
        os.getenv("S3_SECRET_KEY", ""),
        os.getenv("S3_PREFIX", ""),
        os.getenv("S3_FORCE_PATH_STYLE", ""),
        os.getenv("S3_USE_SSL", ""),
        os.getenv("S3_VERIFY_TLS", ""),
    )
    with _BACKEND_LOCK:
        backend = _BACKENDS.get(signature)
        if backend is None:
            backend = S3ObjectStorage() if mode == "s3" else LocalObjectStorage()
            _BACKENDS[signature] = backend
        return backend


_BACKEND_LOCK = Lock()
_BACKENDS: dict[tuple[str, ...], ObjectStorageBackend] = {}
