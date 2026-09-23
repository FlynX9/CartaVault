from __future__ import annotations

import os
import stat as stat_module
import time
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from pathlib import PurePosixPath
from threading import Lock
from typing import Protocol
from uuid import uuid4

import boto3
from boto3.s3.transfer import TransferConfig
from botocore.client import Config
from botocore.exceptions import BotoCoreError, ClientError

from app.config import s3_settings


class ObjectStorageError(RuntimeError):
    pass


class _S3OperationBudget:
    """Bound multi-request S3 workflows without pretending to cancel sockets."""

    def __init__(self) -> None:
        self.deadline = time.monotonic() + s3_settings.operation_timeout_seconds

    def check(self) -> None:
        if time.monotonic() >= self.deadline:
            raise ObjectStorageError("S3 operation deadline exceeded")


def _relative_object_path(key: str, *, backend: str) -> PurePosixPath:
    path = PurePosixPath(key)
    if (
        not key
        or len(key) > 1024
        or "\\" in key
        or path.is_absolute()
        or not path.parts
        or path.as_posix() != key
        or any(part in {"", ".", ".."} for part in path.parts)
    ):
        raise ObjectStorageError(f"Invalid {backend} storage object key")
    return path


@dataclass(frozen=True)
class StorageObject:
    key: str
    size: int
    last_modified: datetime
    unsafe: bool = False


class ObjectStorageBackend(Protocol):
    def put(self, key: str, source: Path, *, content_type: str) -> None: ...
    def materialize(self, key: str, destination: Path) -> bool: ...
    def delete(self, key: str) -> bool: ...
    def stat(self, key: str) -> StorageObject | None: ...
    def list_objects(self) -> list[StorageObject]: ...


class LocalObjectStorage:
    """Filesystem backend confined to one authoritative storage root."""

    def __init__(self, root: Path | None = None) -> None:
        if root is None:
            # Delayed import avoids the storage -> object_storage cycle.
            from app.photos.storage import get_photo_storage_root

            root = get_photo_storage_root()
        unresolved = root.absolute()
        current = unresolved
        while current != current.parent:
            if current.is_symlink():
                raise ObjectStorageError("Local storage root must not use symbolic links")
            current = current.parent
        self.root = unresolved.resolve()

    def _path(self, key: str) -> Path:
        path = _relative_object_path(key, backend="local")
        candidate = self.root.joinpath(*path.parts)
        current = self.root
        for part in path.parts:
            current = current / part
            if current.is_symlink():
                raise ObjectStorageError("Local storage object paths must not use symbolic links")
        resolved = candidate.resolve()
        try:
            resolved.relative_to(self.root)
        except ValueError as error:
            raise ObjectStorageError("Local storage object path escapes its root") from error
        return resolved

    def put(self, key: str, source: Path, *, content_type: str) -> None:
        del content_type
        if self._path(key) != source.resolve() or not source.is_file():
            raise ObjectStorageError("The local media file is missing")

    def materialize(self, key: str, destination: Path) -> bool:
        return self._path(key) == destination.resolve() and destination.is_file()

    def delete(self, key: str) -> bool:
        relative = _relative_object_path(key, backend="local")
        path = self._path(key)
        if self._supports_secure_delete():
            deleted = self._secure_delete(relative)
            if deleted:
                self._prune_empty_directories(self.root.joinpath(*relative.parts).parent)
            return deleted
        if not path.exists():
            return False
        if not path.is_file():
            raise ObjectStorageError("Local storage object is not a regular file")
        try:
            path.unlink()
        except OSError as error:
            raise ObjectStorageError("Unable to delete local storage object") from error
        self._prune_empty_directories(path.parent)
        return True

    def _prune_empty_directories(self, directory: Path) -> None:
        while directory != self.root:
            try:
                directory.rmdir()
            except OSError:
                break
            directory = directory.parent

    @staticmethod
    def _supports_secure_delete() -> bool:
        return (
            hasattr(os, "O_DIRECTORY")
            and hasattr(os, "O_NOFOLLOW")
            and os.open in os.supports_dir_fd
            and os.stat in os.supports_dir_fd
            and os.unlink in os.supports_dir_fd
        )

    def _secure_delete(self, relative: PurePosixPath) -> bool:
        flags = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW
        descriptors: list[int] = []
        try:
            descriptor = os.open(self.root, flags)
            descriptors.append(descriptor)
            for part in relative.parts[:-1]:
                descriptor = os.open(part, flags, dir_fd=descriptor)
                descriptors.append(descriptor)
            try:
                details = os.stat(relative.name, dir_fd=descriptor, follow_symlinks=False)
            except FileNotFoundError:
                return False
            if not stat_module.S_ISREG(details.st_mode):
                raise ObjectStorageError("Local storage object is not a regular file")
            os.unlink(relative.name, dir_fd=descriptor)
            return True
        except FileNotFoundError:
            return False
        except ObjectStorageError:
            raise
        except OSError as error:
            raise ObjectStorageError("Unable to delete local storage object") from error
        finally:
            for descriptor in reversed(descriptors):
                os.close(descriptor)

    def stat(self, key: str) -> StorageObject | None:
        path = self._path(key)
        if not path.exists():
            return None
        if not path.is_file():
            raise ObjectStorageError("Local storage object is not a regular file")
        try:
            details = path.stat()
        except OSError as error:
            raise ObjectStorageError("Unable to inspect local storage object") from error
        return StorageObject(
            key=key,
            size=details.st_size,
            last_modified=datetime.fromtimestamp(details.st_mtime, UTC).replace(tzinfo=None),
        )

    def list_objects(self) -> list[StorageObject]:
        if not self.root.exists():
            return []
        if self.root.is_symlink() or not self.root.is_dir():
            raise ObjectStorageError("Local storage root is unsafe")
        objects: list[StorageObject] = []
        pending = [self.root]
        while pending:
            directory = pending.pop()
            try:
                entries = list(os.scandir(directory))
            except OSError as error:
                raise ObjectStorageError("Unable to scan local storage") from error
            for entry in entries:
                path = Path(entry.path)
                key = path.relative_to(self.root).as_posix()
                if entry.is_symlink():
                    objects.append(StorageObject(key, 0, datetime.fromtimestamp(entry.stat(follow_symlinks=False).st_mtime, UTC).replace(tzinfo=None), unsafe=True))
                elif entry.is_dir(follow_symlinks=False):
                    pending.append(path)
                elif entry.is_file(follow_symlinks=False):
                    details = entry.stat(follow_symlinks=False)
                    objects.append(StorageObject(key, details.st_size, datetime.fromtimestamp(details.st_mtime, UTC).replace(tzinfo=None)))
                else:
                    objects.append(StorageObject(key, 0, datetime.now(UTC).replace(tzinfo=None), unsafe=True))
        return objects


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
        raw_prefix = os.getenv("S3_PREFIX", "media").strip()
        if not raw_prefix:
            raise ObjectStorageError("S3_PREFIX must be nonempty")
        prefix = _relative_object_path(raw_prefix, backend="S3 prefix")
        if self._is_reserved(prefix.as_posix()):
            raise ObjectStorageError("S3_PREFIX must not use the reserved restore namespace")
        self.prefix = prefix.as_posix()
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
            config=Config(
                signature_version="s3v4",
                connect_timeout=min(s3_settings.connect_timeout_seconds, s3_settings.operation_timeout_seconds),
                read_timeout=min(s3_settings.read_timeout_seconds, s3_settings.operation_timeout_seconds),
                retries={
                    "mode": s3_settings.retry_mode,
                    "total_max_attempts": s3_settings.max_attempts,
                },
                s3={"addressing_style": addressing_style},
            ),
        )
        # Photos are bounded by the application upload limit. Single-threaded
        # transfers prevent failed requests from accumulating worker threads.
        self.transfer_config = TransferConfig(
            multipart_threshold=64 * 1024 * 1024,
            max_concurrency=1,
            use_threads=False,
        )

    def _key(self, key: str) -> str:
        normalized = _relative_object_path(key, backend="S3 media").as_posix()
        if self._is_reserved(normalized):
            raise ObjectStorageError("Reserved restore objects cannot be accessed")
        return f"{self.prefix}/{normalized}"

    @staticmethod
    def _is_reserved(key: str) -> bool:
        parts = PurePosixPath(key).parts
        return bool(parts) and parts[0] == ".cartavault-restore"

    def put(self, key: str, source: Path, *, content_type: str) -> None:
        budget = _S3OperationBudget()
        try:
            budget.check()
            self.client.upload_file(
                str(source),
                self.bucket,
                self._key(key),
                ExtraArgs={"ContentType": content_type},
                Config=self.transfer_config,
            )
            budget.check()
        except (BotoCoreError, ClientError, OSError) as error:
            raise ObjectStorageError("Unable to store media in S3") from error

    def materialize(self, key: str, destination: Path) -> bool:
        temporary = destination.with_name(f".{destination.name}.{uuid4().hex}.download")
        budget = _S3OperationBudget()
        try:
            budget.check()
            destination.parent.mkdir(parents=True, exist_ok=True)
            self.client.download_file(
                self.bucket,
                self._key(key),
                str(temporary),
                Config=self.transfer_config,
            )
            budget.check()
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
        if self._is_reserved(key):
            raise ObjectStorageError("Reserved restore objects cannot be deleted")
        budget = _S3OperationBudget()
        try:
            budget.check()
            self.client.delete_object(Bucket=self.bucket, Key=self._key(key))
            budget.check()
            return True
        except (BotoCoreError, ClientError) as error:
            raise ObjectStorageError("Unable to delete media from S3") from error

    def stat(self, key: str) -> StorageObject | None:
        if self._is_reserved(key):
            raise ObjectStorageError("Reserved restore objects cannot be inspected")
        budget = _S3OperationBudget()
        try:
            budget.check()
            response = self.client.head_object(Bucket=self.bucket, Key=self._key(key))
            budget.check()
        except ClientError as error:
            status = error.response.get("ResponseMetadata", {}).get("HTTPStatusCode")
            code = error.response.get("Error", {}).get("Code")
            if status == 404 or code in {"404", "NoSuchKey", "NotFound"}:
                return None
            raise ObjectStorageError("Unable to inspect media in S3") from error
        except BotoCoreError as error:
            raise ObjectStorageError("Unable to inspect media in S3") from error
        modified = response.get("LastModified") or datetime.now(UTC)
        if modified.tzinfo is not None:
            modified = modified.astimezone(UTC).replace(tzinfo=None)
        return StorageObject(key, int(response.get("ContentLength", 0)), modified)

    def list_objects(self) -> list[StorageObject]:
        exact_prefix = f"{self.prefix}/"
        continuation: str | None = None
        objects: list[StorageObject] = []
        budget = _S3OperationBudget()
        try:
            while True:
                budget.check()
                arguments: dict[str, object] = {
                    "Bucket": self.bucket,
                    "Prefix": exact_prefix,
                }
                if continuation:
                    arguments["ContinuationToken"] = continuation
                response = self.client.list_objects_v2(**arguments)
                budget.check()
                for item in response.get("Contents", []):
                    full_key = str(item.get("Key", ""))
                    if not full_key.startswith(exact_prefix):
                        continue
                    key = full_key[len(exact_prefix):]
                    if not key or self._is_reserved(key):
                        continue
                    modified = item.get("LastModified") or datetime.now(UTC)
                    if modified.tzinfo is not None:
                        modified = modified.astimezone(UTC).replace(tzinfo=None)
                    try:
                        _relative_object_path(key, backend="S3 media")
                        unsafe = False
                    except ObjectStorageError:
                        unsafe = True
                    objects.append(StorageObject(key, int(item.get("Size", 0)), modified, unsafe=unsafe))
                if not response.get("IsTruncated"):
                    break
                continuation = response.get("NextContinuationToken")
                if not continuation:
                    raise ObjectStorageError("S3 listing pagination token is missing")
        except (BotoCoreError, ClientError) as error:
            raise ObjectStorageError("Unable to list media in S3") from error
        return objects


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
        os.getenv("S3_CONNECT_TIMEOUT_SECONDS", ""),
        os.getenv("S3_READ_TIMEOUT_SECONDS", ""),
        os.getenv("S3_MAX_ATTEMPTS", ""),
        os.getenv("S3_OPERATION_TIMEOUT_SECONDS", ""),
        os.getenv("S3_RETRY_MODE", ""),
    )
    with _BACKEND_LOCK:
        backend = _BACKENDS.get(signature)
        if backend is None:
            backend = S3ObjectStorage() if mode == "s3" else LocalObjectStorage()
            _BACKENDS[signature] = backend
        return backend


_BACKEND_LOCK = Lock()
_BACKENDS: dict[tuple[str, ...], ObjectStorageBackend] = {}
