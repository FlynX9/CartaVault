#!/usr/bin/env python3
"""Stream and verify CartaVault S3 recovery sets without persisting credentials."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import sys
import tarfile
import tempfile
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path, PurePosixPath
from typing import BinaryIO, Iterator

import boto3
from boto3.s3.transfer import TransferConfig
from botocore.client import Config
from botocore.exceptions import BotoCoreError, ClientError


CONTROL_DIRECTORY = ".cartavault-restore"
CHUNK_SIZE = 1024 * 1024


class RecoveryError(RuntimeError):
    pass


@dataclass(frozen=True)
class S3TimeoutSettings:
    connect_timeout_seconds: int = 5
    read_timeout_seconds: int = 30
    max_attempts: int = 3
    operation_timeout_seconds: int = 300
    retry_mode: str = "standard"


class OperationBudget:
    """Bound multi-request recovery workflows without unsafe thread cancellation."""

    def __init__(self, seconds: int) -> None:
        self.deadline = time.monotonic() + seconds

    def check(self) -> None:
        if time.monotonic() >= self.deadline:
            raise RecoveryError("S3 recovery operation deadline exceeded")


def transfer_config() -> TransferConfig:
    return TransferConfig(
        multipart_threshold=64 * 1024 * 1024,
        max_concurrency=1,
        use_threads=False,
    )


def positive_int(name: str, default: int) -> int:
    raw = os.getenv(name)
    if raw is None:
        return default
    try:
        value = int(raw)
    except ValueError as error:
        raise RecoveryError(f"{name} must be a positive integer") from error
    if value <= 0:
        raise RecoveryError(f"{name} must be a positive integer")
    return value


def timeout_settings() -> S3TimeoutSettings:
    retry_mode = os.getenv("S3_RETRY_MODE", "standard").strip().lower()
    if retry_mode not in {"standard", "adaptive"}:
        raise RecoveryError("S3_RETRY_MODE must be 'standard' or 'adaptive'")
    return S3TimeoutSettings(
        connect_timeout_seconds=positive_int("S3_CONNECT_TIMEOUT_SECONDS", 5),
        read_timeout_seconds=positive_int("S3_READ_TIMEOUT_SECONDS", 30),
        max_attempts=positive_int("S3_MAX_ATTEMPTS", 3),
        operation_timeout_seconds=positive_int("S3_OPERATION_TIMEOUT_SECONDS", 300),
        retry_mode=retry_mode,
    )


@dataclass(frozen=True)
class ObjectRecord:
    key: str
    size: int
    sha256: str
    content_type: str

    def to_json(self) -> str:
        return json.dumps(
            {
                "key": self.key,
                "size": self.size,
                "sha256": self.sha256,
                "content_type": self.content_type,
            },
            ensure_ascii=True,
            separators=(",", ":"),
            sort_keys=True,
        )


@dataclass(frozen=True)
class StorageConfig:
    bucket: str
    prefix: str

    @property
    def live_prefix(self) -> str:
        return f"{self.prefix}/"

    @property
    def control_prefix(self) -> str:
        return f"{self.prefix}/{CONTROL_DIRECTORY}/"

    def control_restore_prefix(self, restore_id: str) -> str:
        validate_restore_id(restore_id)
        return f"{self.control_prefix}{restore_id}/"


def boolean(name: str, default: bool) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    normalized = value.strip().lower()
    if normalized in {"1", "true", "yes", "on"}:
        return True
    if normalized in {"0", "false", "no", "off"}:
        return False
    raise RecoveryError(f"{name} must be a boolean")


def storage_config() -> StorageConfig:
    bucket = os.getenv("S3_BUCKET", "").strip()
    raw_prefix = os.getenv("S3_PREFIX", "media").strip()
    if not bucket or any(character in bucket for character in "\r\n\t"):
        raise RecoveryError("S3_BUCKET must be a non-empty single-line value")
    if not raw_prefix:
        raise RecoveryError(
            "S3_PREFIX must be non-empty for backup/restore namespace safety"
        )
    if any(character in raw_prefix for character in "\r\n\t="):
        raise RecoveryError("S3_PREFIX contains unsupported characters")
    if raw_prefix.startswith("/") or raw_prefix.endswith("/") or "\\" in raw_prefix:
        raise RecoveryError("S3_PREFIX must be a normalized relative prefix")
    prefix_path = PurePosixPath(raw_prefix)
    if any(part in {"", ".", ".."} for part in prefix_path.parts):
        raise RecoveryError("S3_PREFIX must be a normalized relative prefix")
    prefix = prefix_path.as_posix()
    if prefix != raw_prefix:
        raise RecoveryError("S3_PREFIX must be a normalized relative prefix")
    if f"/{CONTROL_DIRECTORY}" in f"/{prefix}" or prefix == CONTROL_DIRECTORY:
        raise RecoveryError(f"S3_PREFIX must not use the reserved {CONTROL_DIRECTORY} name")
    return StorageConfig(bucket=bucket, prefix=prefix)


def s3_client():
    settings = timeout_settings()
    access_key = os.getenv("S3_ACCESS_KEY", "").strip()
    secret_key = os.getenv("S3_SECRET_KEY", "").strip()
    if not access_key or not secret_key:
        raise RecoveryError("S3_ACCESS_KEY and S3_SECRET_KEY are required")
    endpoint = os.getenv("S3_ENDPOINT", "").strip() or None
    region = os.getenv("S3_REGION", "us-east-1").strip()
    addressing_style = "path" if boolean("S3_FORCE_PATH_STYLE", False) else "auto"
    return boto3.client(
        "s3",
        endpoint_url=endpoint,
        region_name=region,
        aws_access_key_id=access_key,
        aws_secret_access_key=secret_key,
        use_ssl=boolean("S3_USE_SSL", True),
        verify=boolean("S3_VERIFY_TLS", True),
        config=Config(
            signature_version="s3v4",
            connect_timeout=min(settings.connect_timeout_seconds, settings.operation_timeout_seconds),
            read_timeout=min(settings.read_timeout_seconds, settings.operation_timeout_seconds),
            retries={
                "mode": settings.retry_mode,
                "total_max_attempts": settings.max_attempts,
            },
            s3={"addressing_style": addressing_style},
        ),
    )


def operation_budget() -> OperationBudget:
    return OperationBudget(timeout_settings().operation_timeout_seconds)


def validate_restore_id(restore_id: str) -> None:
    if not restore_id or any(character not in "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-" for character in restore_id):
        raise RecoveryError("restore ID contains unsupported characters")


def validate_relative_key(key: str) -> str:
    if not key or any(character in key for character in "\\\r\n\t\0"):
        raise RecoveryError(f"unsafe S3 recovery key: {key!r}")
    path = PurePosixPath(key)
    if path.is_absolute() or any(part in {"", ".", ".."} for part in path.parts):
        raise RecoveryError(f"unsafe S3 recovery key: {key!r}")
    normalized = path.as_posix()
    if normalized != key or path.parts[0] == CONTROL_DIRECTORY:
        raise RecoveryError(f"unsafe or reserved S3 recovery key: {key!r}")
    return normalized


def live_relative_key(config: StorageConfig, full_key: str) -> str:
    if not full_key.startswith(config.live_prefix):
        raise RecoveryError(f"object is outside configured S3 prefix: {full_key!r}")
    return validate_relative_key(full_key[len(config.live_prefix) :])


def iter_objects(client, bucket: str, prefix: str, budget: OperationBudget | None = None) -> Iterator[dict]:
    continuation: str | None = None
    while True:
        if budget is not None:
            budget.check()
        arguments: dict[str, object] = {"Bucket": bucket, "Prefix": prefix}
        if continuation:
            arguments["ContinuationToken"] = continuation
        try:
            page = client.list_objects_v2(**arguments)
        except (BotoCoreError, ClientError, OSError) as error:
            raise RecoveryError("unable to list S3 recovery objects") from error
        for item in page.get("Contents", []):
            yield item
        if not page.get("IsTruncated"):
            return
        continuation = page.get("NextContinuationToken")
        if not continuation:
            raise RecoveryError("S3 listing pagination token is missing")


def list_live_objects(client, config: StorageConfig, budget: OperationBudget | None = None) -> list[dict]:
    objects: list[dict] = []
    seen: set[str] = set()
    for item in iter_objects(client, config.bucket, config.live_prefix, budget):
        full_key = str(item["Key"])
        if full_key.startswith(config.control_prefix):
            continue
        relative = live_relative_key(config, full_key)
        if relative in seen:
            raise RecoveryError(f"duplicate S3 key: {relative}")
        seen.add(relative)
        objects.append(item)
    return sorted(objects, key=lambda item: str(item["Key"]))


def object_fingerprint(item: dict) -> tuple[str, int, str, str]:
    modified = item.get("LastModified")
    if isinstance(modified, datetime):
        modified_value = modified.astimezone(timezone.utc).isoformat()
    else:
        modified_value = str(modified or "")
    return (
        str(item["Key"]),
        int(item["Size"]),
        str(item.get("ETag", "")),
        modified_value,
    )


def sha256_stream(
    source: BinaryIO,
    destination: BinaryIO | None = None,
    budget: OperationBudget | None = None,
) -> tuple[str, int]:
    digest = hashlib.sha256()
    size = 0
    while True:
        if budget is not None:
            budget.check()
        chunk = source.read(CHUNK_SIZE)
        if not chunk:
            break
        digest.update(chunk)
        size += len(chunk)
        if destination is not None:
            destination.write(chunk)
    if budget is not None:
        budget.check()
    return digest.hexdigest(), size


def read_records(path: Path) -> list[ObjectRecord]:
    records: list[ObjectRecord] = []
    seen: set[str] = set()
    try:
        lines = path.read_text(encoding="utf-8").splitlines()
    except OSError as error:
        raise RecoveryError(f"unable to read object manifest: {error}") from error
    for line_number, line in enumerate(lines, start=1):
        if not line:
            raise RecoveryError(f"empty object manifest line {line_number}")
        try:
            value = json.loads(line)
        except json.JSONDecodeError as error:
            raise RecoveryError(f"invalid object manifest JSON on line {line_number}") from error
        if set(value) != {"key", "size", "sha256", "content_type"}:
            raise RecoveryError(f"unexpected object manifest fields on line {line_number}")
        key = validate_relative_key(value["key"] if isinstance(value["key"], str) else "")
        size = value["size"]
        checksum = value["sha256"]
        content_type = value["content_type"]
        if not isinstance(size, int) or isinstance(size, bool) or size < 0:
            raise RecoveryError(f"invalid object size on line {line_number}")
        if not isinstance(checksum, str) or len(checksum) != 64 or any(character not in "0123456789abcdef" for character in checksum):
            raise RecoveryError(f"invalid SHA-256 on line {line_number}")
        if not isinstance(content_type, str) or any(character in content_type for character in "\r\n\0") or len(content_type) > 255:
            raise RecoveryError(f"invalid content type on line {line_number}")
        if key in seen:
            raise RecoveryError(f"duplicate object manifest key: {key}")
        seen.add(key)
        records.append(ObjectRecord(key, size, checksum, content_type))
    if [record.key for record in records] != sorted(record.key for record in records):
        raise RecoveryError("object manifest keys must be sorted")
    return records


def write_records(path: Path, records: list[ObjectRecord]) -> None:
    with path.open("w", encoding="utf-8", newline="\n") as destination:
        for record in records:
            destination.write(record.to_json() + "\n")


def ensure_no_control_objects(client, config: StorageConfig, budget: OperationBudget | None = None) -> None:
    first = next(iter(iter_objects(client, config.bucket, config.control_prefix, budget)), None)
    if first is not None:
        raise RecoveryError(
            f"leftover S3 restore object detected under {config.control_prefix}; MANUAL RECOVERY REQUIRED"
        )


def command_inspect(_args: argparse.Namespace) -> None:
    config = storage_config()
    client = s3_client()
    budget = operation_budget()
    budget.check()
    client.head_bucket(Bucket=config.bucket)
    budget.check()
    ensure_no_control_objects(client, config, budget)
    print(f"bucket={config.bucket}")
    print(f"prefix={config.prefix}")


def command_backup(args: argparse.Namespace) -> None:
    config = storage_config()
    client = s3_client()
    budget = operation_budget()
    budget.check()
    ensure_no_control_objects(client, config, budget)
    directory = Path(args.directory)
    archive_path = Path(args.archive)
    manifest_path = Path(args.manifest)
    directory.mkdir(parents=True, exist_ok=False)
    try:
        before = list_live_objects(client, config, budget)
        records: list[ObjectRecord] = []
        for item in before:
            full_key = str(item["Key"])
            relative = live_relative_key(config, full_key)
            destination = directory.joinpath(*PurePosixPath(relative).parts)
            destination.parent.mkdir(parents=True, exist_ok=True)
            response = None
            try:
                budget.check()
                response = client.get_object(Bucket=config.bucket, Key=full_key)
                with destination.open("xb") as output:
                    checksum, size = sha256_stream(response["Body"], output, budget)
                budget.check()
            except (BotoCoreError, ClientError, OSError) as error:
                raise RecoveryError(f"unable to copy S3 object {relative}: {error}") from error
            finally:
                if response is not None:
                    response["Body"].close()
            if size != int(item["Size"]) or size != int(response.get("ContentLength", -1)):
                raise RecoveryError(f"S3 object changed size while copying: {relative}")
            records.append(
                ObjectRecord(relative, size, checksum, str(response.get("ContentType") or ""))
            )
            maybe_fail_after_copy(len(records), "backup")
        after = list_live_objects(client, config, budget)
        if [object_fingerprint(item) for item in before] != [object_fingerprint(item) for item in after]:
            raise RecoveryError("S3 namespace changed during backup capture")
        records.sort(key=lambda record: record.key)
        write_records(manifest_path, records)
        with tarfile.open(archive_path, "w:gz") as archive:
            for record in records:
                source = directory.joinpath(*PurePosixPath(record.key).parts)
                archive.add(source, arcname=record.key, recursive=False)
    except Exception:
        shutil.rmtree(directory, ignore_errors=True)
        raise
    shutil.rmtree(directory)
    print(f"objects={len(records)} bytes={sum(record.size for record in records)}")


def validate_archive(archive_path: Path, records: list[ObjectRecord]) -> None:
    expected = {record.key: record for record in records}
    seen: set[str] = set()
    try:
        with tarfile.open(archive_path, "r:gz") as archive:
            for member in archive:
                key = validate_relative_key(member.name)
                if not member.isfile():
                    raise RecoveryError(f"S3 recovery archive member is not a regular file: {key}")
                if key in seen or key not in expected:
                    raise RecoveryError(f"unexpected or duplicate S3 recovery archive member: {key}")
                source = archive.extractfile(member)
                if source is None:
                    raise RecoveryError(f"unable to read S3 recovery archive member: {key}")
                checksum, size = sha256_stream(source)
                record = expected[key]
                if size != record.size or member.size != record.size or checksum != record.sha256:
                    raise RecoveryError(f"S3 recovery object checksum/size mismatch: {key}")
                seen.add(key)
    except (OSError, tarfile.TarError) as error:
        raise RecoveryError(f"invalid S3 recovery archive: {error}") from error
    missing = sorted(set(expected) - seen)
    if missing:
        raise RecoveryError(f"S3 recovery archive is missing object: {missing[0]}")


def command_preflight(args: argparse.Namespace) -> None:
    config = storage_config()
    if config.bucket != args.expected_bucket or config.prefix != args.expected_prefix:
        raise RecoveryError(
            "live S3 bucket/prefix does not match the recovery-set manifest"
        )
    client = s3_client()
    budget = operation_budget()
    budget.check()
    client.head_bucket(Bucket=config.bucket)
    budget.check()
    ensure_no_control_objects(client, config, budget)
    records = read_records(Path(args.manifest))
    validate_archive(Path(args.archive), records)
    print(f"objects={len(records)} bytes={sum(record.size for record in records)}")


def read_references(path: Path) -> list[tuple[str, int | None]]:
    references: list[tuple[str, int | None]] = []
    seen: set[str] = set()
    for line_number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
        if not line:
            continue
        parts = line.split("|")
        if len(parts) != 2:
            raise RecoveryError(f"invalid database media reference on line {line_number}")
        key = validate_relative_key(parts[0])
        size_value = parts[1]
        if size_value and (not size_value.isdigit() or int(size_value) < 0):
            raise RecoveryError(f"invalid database media size on line {line_number}")
        if key in seen:
            raise RecoveryError(f"duplicate database media reference: {key}")
        seen.add(key)
        references.append((key, int(size_value) if size_value else None))
    return references


def command_validate_references(args: argparse.Namespace) -> None:
    records = {record.key: record for record in read_records(Path(args.manifest))}
    references = read_references(Path(args.references))
    for key, expected_size in references:
        record = records.get(key)
        if record is None:
            raise RecoveryError(f"S3 recovery set is missing database-backed object: {key}")
        if expected_size is not None and record.size != expected_size:
            raise RecoveryError(
                f"S3 recovery object size differs from database for {key}: expected {expected_size}, got {record.size}"
            )
    print(f"references={len(references)}")


def restore_prefixes(config: StorageConfig, restore_id: str) -> tuple[str, str, str]:
    root = config.control_restore_prefix(restore_id)
    return root, f"{root}stage/", f"{root}previous/"


def put_metadata(
    client,
    config: StorageConfig,
    restore_id: str,
    phase: str,
    budget: OperationBudget | None = None,
) -> None:
    root, _, _ = restore_prefixes(config, restore_id)
    payload = json.dumps(
        {
            "restore_id": restore_id,
            "bucket": config.bucket,
            "prefix": config.prefix,
            "phase": phase,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        },
        ensure_ascii=True,
        sort_keys=True,
    ).encode("utf-8")
    if budget is not None:
        budget.check()
    client.put_object(
        Bucket=config.bucket,
        Key=f"{root}recovery.json",
        Body=payload,
        ContentType="application/json",
    )
    if budget is not None:
        budget.check()


def copy_key(
    client,
    bucket: str,
    source: str,
    destination: str,
    budget: OperationBudget | None = None,
) -> None:
    # boto3's managed copy transparently uses multipart copy above 5 GiB.
    if budget is not None:
        budget.check()
    client.copy(
        {"Bucket": bucket, "Key": source},
        bucket,
        destination,
        Config=transfer_config(),
    )
    if budget is not None:
        budget.check()


def delete_keys(client, bucket: str, keys: list[str], budget: OperationBudget | None = None) -> None:
    for offset in range(0, len(keys), 1000):
        batch = keys[offset : offset + 1000]
        if not batch:
            continue
        if budget is not None:
            budget.check()
        response = client.delete_objects(
            Bucket=bucket,
            Delete={"Objects": [{"Key": key} for key in batch], "Quiet": True},
        )
        errors = response.get("Errors", [])
        if errors:
            raise RecoveryError(f"S3 delete failed for {errors[0].get('Key', 'unknown key')}")
        if budget is not None:
            budget.check()


def delete_prefix(
    client,
    bucket: str,
    prefix: str,
    budget: OperationBudget | None = None,
) -> None:
    if not prefix or not prefix.endswith("/"):
        raise RecoveryError("refusing unsafe S3 prefix deletion")
    delete_keys(client, bucket, [str(item["Key"]) for item in iter_objects(client, bucket, prefix, budget)], budget)


def upload_archive_to_stage(
    client,
    config: StorageConfig,
    restore_id: str,
    archive_path: Path,
    records: list[ObjectRecord],
    work_directory: Path,
    budget: OperationBudget | None = None,
) -> None:
    _, stage_prefix, _ = restore_prefixes(config, restore_id)
    expected = {record.key: record for record in records}
    seen: set[str] = set()
    work_directory.mkdir(parents=True, exist_ok=True)
    with tarfile.open(archive_path, "r:gz") as archive:
        for member in archive:
            key = validate_relative_key(member.name)
            if not member.isfile() or key in seen or key not in expected:
                raise RecoveryError(f"invalid S3 staging archive member: {key}")
            source = archive.extractfile(member)
            if source is None:
                raise RecoveryError(f"unable to extract S3 staging object: {key}")
            temporary = work_directory / "object.part"
            try:
                with temporary.open("wb") as output:
                    checksum, size = sha256_stream(source, output, budget)
                record = expected[key]
                if checksum != record.sha256 or size != record.size:
                    raise RecoveryError(f"S3 staging object checksum/size mismatch: {key}")
                extra_args = {"ContentType": record.content_type} if record.content_type else None
                if budget is not None:
                    budget.check()
                if extra_args:
                    client.upload_file(
                        str(temporary),
                        config.bucket,
                        f"{stage_prefix}{key}",
                        ExtraArgs=extra_args,
                        Config=transfer_config(),
                    )
                else:
                    client.upload_file(
                        str(temporary),
                        config.bucket,
                        f"{stage_prefix}{key}",
                        Config=transfer_config(),
                    )
                if budget is not None:
                    budget.check()
            finally:
                temporary.unlink(missing_ok=True)
            seen.add(key)
            maybe_fail_after_copy(len(seen), "staging")
    if seen != set(expected):
        raise RecoveryError("S3 staging archive is incomplete")


def hash_remote_object(
    client,
    bucket: str,
    key: str,
    budget: OperationBudget | None = None,
) -> tuple[str, int, str]:
    if budget is not None:
        budget.check()
    response = client.get_object(Bucket=bucket, Key=key)
    try:
        checksum, size = sha256_stream(response["Body"], budget=budget)
    finally:
        response["Body"].close()
    if budget is not None:
        budget.check()
    return checksum, size, str(response.get("ContentType") or "")


def validate_remote_prefix(
    client,
    bucket: str,
    prefix: str,
    records: list[ObjectRecord],
    budget: OperationBudget | None = None,
) -> None:
    expected = {record.key: record for record in records}
    actual: dict[str, dict] = {}
    for item in iter_objects(client, bucket, prefix, budget):
        full_key = str(item["Key"])
        relative_value = full_key[len(prefix) :]
        if relative_value.startswith(f"{CONTROL_DIRECTORY}/"):
            continue
        relative = validate_relative_key(relative_value)
        if relative in actual:
            raise RecoveryError(f"duplicate remote S3 object: {relative}")
        actual[relative] = item
    if set(actual) != set(expected):
        missing = sorted(set(expected) - set(actual))
        extra = sorted(set(actual) - set(expected))
        detail = missing[0] if missing else extra[0]
        raise RecoveryError(f"remote S3 object set differs from manifest: {detail}")
    for relative, record in expected.items():
        checksum, size, _content_type = hash_remote_object(client, bucket, f"{prefix}{relative}", budget)
        if size != record.size or checksum != record.sha256:
            raise RecoveryError(f"remote S3 object checksum/size mismatch: {relative}")


def command_stage(args: argparse.Namespace) -> None:
    config = storage_config()
    client = s3_client()
    budget = operation_budget()
    ensure_no_control_objects(client, config, budget)
    records = read_records(Path(args.manifest))
    validate_archive(Path(args.archive), records)
    put_metadata(client, config, args.restore_id, "staging", budget)
    try:
        upload_archive_to_stage(
            client,
            config,
            args.restore_id,
            Path(args.archive),
            records,
            Path(args.work_directory),
            budget,
        )
        _, stage_prefix, _ = restore_prefixes(config, args.restore_id)
        validate_remote_prefix(client, config.bucket, stage_prefix, records, budget)
        put_metadata(client, config, args.restore_id, "staged", budget)
    except Exception:
        root, _, _ = restore_prefixes(config, args.restore_id)
        try:
            delete_prefix(client, config.bucket, root, budget)
        except Exception:
            pass
        raise
    print(f"objects={len(records)} bytes={sum(record.size for record in records)}")


def command_snapshot_live(args: argparse.Namespace) -> None:
    config = storage_config()
    client = s3_client()
    budget = operation_budget()
    root, _, previous_prefix = restore_prefixes(config, args.restore_id)
    if not any(str(item["Key"]).startswith(root) for item in iter_objects(client, config.bucket, root, budget)):
        raise RecoveryError("S3 restore staging metadata is missing")
    put_metadata(client, config, args.restore_id, "preserving-live", budget)
    records: list[ObjectRecord] = []
    live_objects = list_live_objects(client, config, budget)
    for index, item in enumerate(live_objects, start=1):
        full_key = str(item["Key"])
        relative = live_relative_key(config, full_key)
        checksum, size, content_type = hash_remote_object(client, config.bucket, full_key, budget)
        if size != int(item["Size"]):
            raise RecoveryError(f"live S3 object changed during rollback snapshot: {relative}")
        copy_key(client, config.bucket, full_key, f"{previous_prefix}{relative}", budget)
        records.append(ObjectRecord(relative, size, checksum, content_type))
        maybe_fail_after_copy(index, "snapshot")
    records.sort(key=lambda record: record.key)
    validate_remote_prefix(client, config.bucket, previous_prefix, records, budget)
    write_records(Path(args.output_manifest), records)
    put_metadata(client, config, args.restore_id, "previous-ready", budget)
    print(f"objects={len(records)} bytes={sum(record.size for record in records)}")


def replace_live_from_prefix(
    client,
    config: StorageConfig,
    source_prefix: str,
    records: list[ObjectRecord],
    failure_phase: str,
    budget: OperationBudget | None = None,
) -> None:
    live_keys = [str(item["Key"]) for item in list_live_objects(client, config, budget)]
    delete_keys(client, config.bucket, live_keys, budget)
    for index, record in enumerate(records, start=1):
        copy_key(
            client,
            config.bucket,
            f"{source_prefix}{record.key}",
            f"{config.live_prefix}{record.key}",
            budget,
        )
        maybe_fail_after_copy(index, failure_phase)


def command_cutover(args: argparse.Namespace) -> None:
    config = storage_config()
    client = s3_client()
    budget = operation_budget()
    root, stage_prefix, _ = restore_prefixes(config, args.restore_id)
    records = read_records(Path(args.manifest))
    put_metadata(client, config, args.restore_id, "s3-cutover", budget)
    replace_live_from_prefix(client, config, stage_prefix, records, "cutover", budget)
    validate_remote_prefix(client, config.bucket, config.live_prefix, records, budget)
    put_metadata(client, config, args.restore_id, "s3-cutover-complete", budget)
    print(f"objects={len(records)} bytes={sum(record.size for record in records)}")


def command_rollback(args: argparse.Namespace) -> None:
    config = storage_config()
    client = s3_client()
    budget = operation_budget()
    _, _, previous_prefix = restore_prefixes(config, args.restore_id)
    records = read_records(Path(args.manifest))
    put_metadata(client, config, args.restore_id, "rolling-back-s3", budget)
    replace_live_from_prefix(client, config, previous_prefix, records, "rollback", budget)
    validate_remote_prefix(client, config.bucket, config.live_prefix, records, budget)
    put_metadata(client, config, args.restore_id, "s3-rollback-complete", budget)
    print(f"objects={len(records)} bytes={sum(record.size for record in records)}")


def command_validate_live(args: argparse.Namespace) -> None:
    config = storage_config()
    client = s3_client()
    budget = operation_budget()
    records = read_records(Path(args.manifest))
    validate_remote_prefix(client, config.bucket, config.live_prefix, records, budget)
    print(f"objects={len(records)} bytes={sum(record.size for record in records)}")


def command_cleanup(args: argparse.Namespace) -> None:
    config = storage_config()
    client = s3_client()
    budget = operation_budget()
    root, _, _ = restore_prefixes(config, args.restore_id)
    if not root.startswith(config.control_prefix):
        raise RecoveryError("refusing cleanup outside S3 restore control namespace")
    delete_prefix(client, config.bucket, root, budget)


def maybe_fail_after_copy(copy_count: int, phase: str) -> None:
    if (
        os.getenv("CARTAVAULT_RESTORE_TESTING", "false") != "true"
        and os.getenv("CARTAVAULT_BACKUP_TESTING", "false") != "true"
    ):
        return
    configured_phase = os.getenv("CARTAVAULT_S3_TEST_FAILURE_PHASE", "")
    configured_count = os.getenv("CARTAVAULT_S3_TEST_FAIL_AFTER_COPIES", "")
    if configured_phase != phase or not configured_count:
        return
    try:
        expected_count = int(configured_count)
    except ValueError as error:
        raise RecoveryError("CARTAVAULT_S3_TEST_FAIL_AFTER_COPIES must be an integer") from error
    if copy_count >= expected_count:
        raise RecoveryError(f"injected S3 {phase} failure after {copy_count} object copies")


def parser() -> argparse.ArgumentParser:
    result = argparse.ArgumentParser()
    subparsers = result.add_subparsers(dest="command", required=True)
    subparsers.add_parser("inspect").set_defaults(function=command_inspect)

    backup = subparsers.add_parser("backup")
    backup.add_argument("--directory", required=True)
    backup.add_argument("--archive", required=True)
    backup.add_argument("--manifest", required=True)
    backup.set_defaults(function=command_backup)

    preflight = subparsers.add_parser("preflight")
    preflight.add_argument("--archive", required=True)
    preflight.add_argument("--manifest", required=True)
    preflight.add_argument("--expected-bucket", required=True)
    preflight.add_argument("--expected-prefix", required=True)
    preflight.set_defaults(function=command_preflight)

    references = subparsers.add_parser("validate-references")
    references.add_argument("--manifest", required=True)
    references.add_argument("--references", required=True)
    references.set_defaults(function=command_validate_references)

    stage = subparsers.add_parser("stage")
    stage.add_argument("--restore-id", required=True)
    stage.add_argument("--archive", required=True)
    stage.add_argument("--manifest", required=True)
    stage.add_argument("--work-directory", required=True)
    stage.set_defaults(function=command_stage)

    snapshot = subparsers.add_parser("snapshot-live")
    snapshot.add_argument("--restore-id", required=True)
    snapshot.add_argument("--output-manifest", required=True)
    snapshot.set_defaults(function=command_snapshot_live)

    cutover = subparsers.add_parser("cutover")
    cutover.add_argument("--restore-id", required=True)
    cutover.add_argument("--manifest", required=True)
    cutover.set_defaults(function=command_cutover)

    rollback = subparsers.add_parser("rollback")
    rollback.add_argument("--restore-id", required=True)
    rollback.add_argument("--manifest", required=True)
    rollback.set_defaults(function=command_rollback)

    validate = subparsers.add_parser("validate-live")
    validate.add_argument("--manifest", required=True)
    validate.set_defaults(function=command_validate_live)

    cleanup = subparsers.add_parser("cleanup")
    cleanup.add_argument("--restore-id", required=True)
    cleanup.set_defaults(function=command_cleanup)
    return result


def main() -> int:
    args = parser().parse_args()
    try:
        args.function(args)
    except (RecoveryError, BotoCoreError, ClientError, OSError, tarfile.TarError) as error:
        print(f"ERROR: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
