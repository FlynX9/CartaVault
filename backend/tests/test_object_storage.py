from pathlib import Path
from unittest.mock import Mock

import pytest
from botocore.exceptions import ClientError

from app.photos.object_storage import ObjectStorageError, S3ObjectStorage, build_object_storage


pytestmark = pytest.mark.unit


def configure_s3(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("MEDIA_STORAGE", "s3")
    monkeypatch.setenv("S3_BUCKET", "cartavault-test")
    monkeypatch.setenv("S3_ACCESS_KEY", "test-access")
    monkeypatch.setenv("S3_SECRET_KEY", "test-secret")
    monkeypatch.setenv("S3_ENDPOINT", "http://minio:9000")
    monkeypatch.setenv("S3_FORCE_PATH_STYLE", "true")


def test_s3_backend_uses_custom_endpoint_and_never_sets_public_acl(monkeypatch, tmp_path: Path) -> None:
    configure_s3(monkeypatch)
    client = Mock()
    factory = Mock(return_value=client)
    monkeypatch.setattr("app.photos.object_storage.boto3.client", factory)
    source = tmp_path / "photo.webp"
    source.write_bytes(b"private")

    backend = build_object_storage()
    backend.put("scope/photo.webp", source, content_type="image/webp")

    factory.assert_called_once()
    assert factory.call_args.kwargs["endpoint_url"] == "http://minio:9000"
    assert factory.call_args.kwargs["config"].s3["addressing_style"] == "path"
    client.upload_file.assert_called_once_with(
        str(source),
        "cartavault-test",
        "media/scope/photo.webp",
        ExtraArgs={"ContentType": "image/webp"},
    )
    assert "ACL" not in client.upload_file.call_args.kwargs["ExtraArgs"]


def test_s3_backend_materializes_private_object_atomically(monkeypatch, tmp_path: Path) -> None:
    configure_s3(monkeypatch)
    client = Mock()

    def download(_bucket: str, _key: str, destination: str) -> None:
        Path(destination).write_bytes(b"downloaded")

    client.download_file.side_effect = download
    monkeypatch.setattr("app.photos.object_storage.boto3.client", Mock(return_value=client))
    destination = tmp_path / "cache" / "photo.webp"

    assert S3ObjectStorage().materialize("scope/photo.webp", destination)
    assert destination.read_bytes() == b"downloaded"
    assert not list(destination.parent.glob("*.download"))


def test_s3_backend_returns_missing_without_leaving_partial_file(monkeypatch, tmp_path: Path) -> None:
    configure_s3(monkeypatch)
    client = Mock()
    client.download_file.side_effect = ClientError(
        {"Error": {"Code": "NoSuchKey"}, "ResponseMetadata": {"HTTPStatusCode": 404}},
        "GetObject",
    )
    monkeypatch.setattr("app.photos.object_storage.boto3.client", Mock(return_value=client))
    destination = tmp_path / "photo.webp"

    assert not S3ObjectStorage().materialize("scope/missing.webp", destination)
    assert not destination.exists()


def test_s3_backend_requires_private_credentials(monkeypatch) -> None:
    monkeypatch.setenv("MEDIA_STORAGE", "s3")
    monkeypatch.delenv("S3_BUCKET", raising=False)

    with pytest.raises(ObjectStorageError, match="S3_BUCKET"):
        build_object_storage()


def test_unknown_media_backend_is_rejected(monkeypatch) -> None:
    monkeypatch.setenv("MEDIA_STORAGE", "ftp")

    with pytest.raises(ObjectStorageError, match="local or s3"):
        build_object_storage()
