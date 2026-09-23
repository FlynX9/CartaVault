from pathlib import Path
from datetime import UTC, datetime
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
    assert factory.call_args.kwargs["config"].connect_timeout == 5
    assert factory.call_args.kwargs["config"].read_timeout == 30
    assert factory.call_args.kwargs["config"].retries["total_max_attempts"] == 3
    client.upload_file.assert_called_once_with(
        str(source),
        "cartavault-test",
        "media/scope/photo.webp",
        ExtraArgs={"ContentType": "image/webp"},
        Config=backend.transfer_config,
    )
    assert "ACL" not in client.upload_file.call_args.kwargs["ExtraArgs"]


def test_s3_backend_materializes_private_object_atomically(monkeypatch, tmp_path: Path) -> None:
    configure_s3(monkeypatch)
    client = Mock()

    def download(_bucket: str, _key: str, destination: str, **_kwargs) -> None:
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


def test_s3_backend_deletes_private_object_key(monkeypatch) -> None:
    configure_s3(monkeypatch)
    client = Mock()
    monkeypatch.setattr("app.photos.object_storage.boto3.client", Mock(return_value=client))

    assert S3ObjectStorage().delete("scope/photo.webp")

    client.delete_object.assert_called_once_with(
        Bucket="cartavault-test",
        Key="media/scope/photo.webp",
    )


def test_s3_backend_requires_private_credentials(monkeypatch) -> None:
    monkeypatch.setenv("MEDIA_STORAGE", "s3")
    monkeypatch.delenv("S3_BUCKET", raising=False)

    with pytest.raises(ObjectStorageError, match="S3_BUCKET"):
        build_object_storage()


def test_unknown_media_backend_is_rejected(monkeypatch) -> None:
    monkeypatch.setenv("MEDIA_STORAGE", "ftp")

    with pytest.raises(ObjectStorageError, match="local or s3"):
        build_object_storage()


def test_s3_listing_uses_exact_prefix_paginates_and_excludes_restore(monkeypatch) -> None:
    configure_s3(monkeypatch)
    client = Mock()
    modified = datetime.now(UTC)
    client.list_objects_v2.side_effect = [
        {
            "Contents": [
                {"Key": "media/scope/photo.jpg", "Size": 4, "LastModified": modified},
                {"Key": "media/.cartavault-restore/snapshot", "Size": 5, "LastModified": modified},
                {"Key": "media-other/outside.jpg", "Size": 6, "LastModified": modified},
            ],
            "IsTruncated": True,
            "NextContinuationToken": "page-2",
        },
        {
            "Contents": [{"Key": "media/.thumbnails/photo.webp", "Size": 7, "LastModified": modified}],
            "IsTruncated": False,
        },
    ]
    monkeypatch.setattr("app.photos.object_storage.boto3.client", Mock(return_value=client))

    objects = S3ObjectStorage().list_objects()
    assert [item.key for item in objects] == ["scope/photo.jpg", ".thumbnails/photo.webp"]
    assert client.list_objects_v2.call_args_list[0].kwargs == {
        "Bucket": "cartavault-test",
        "Prefix": "media/",
    }
    assert client.list_objects_v2.call_args_list[1].kwargs["ContinuationToken"] == "page-2"


def test_s3_destructive_work_requires_prefix_and_protects_restore(monkeypatch) -> None:
    configure_s3(monkeypatch)
    monkeypatch.setenv("S3_PREFIX", "")
    monkeypatch.setattr("app.photos.object_storage.boto3.client", Mock(return_value=Mock()))
    with pytest.raises(ObjectStorageError, match="nonempty"):
        S3ObjectStorage()

    monkeypatch.setenv("S3_PREFIX", "media")
    backend = S3ObjectStorage()
    with pytest.raises(ObjectStorageError, match="Reserved"):
        backend.delete(".cartavault-restore/snapshot")


@pytest.mark.parametrize("value", ["/media", "media/", "media//tenant", "media/./tenant", ".cartavault-restore"])
def test_s3_backend_rejects_unsafe_prefixes(monkeypatch, value: str) -> None:
    configure_s3(monkeypatch)
    monkeypatch.setenv("S3_PREFIX", value)
    monkeypatch.setattr("app.photos.object_storage.boto3.client", Mock(return_value=Mock()))

    with pytest.raises(ObjectStorageError):
        S3ObjectStorage()


@pytest.mark.parametrize("key", ["scope//photo.jpg", "scope/./photo.jpg", "scope/photo.jpg/"])
def test_s3_backend_rejects_noncanonical_object_aliases(monkeypatch, key: str) -> None:
    configure_s3(monkeypatch)
    client = Mock()
    monkeypatch.setattr("app.photos.object_storage.boto3.client", Mock(return_value=client))

    with pytest.raises(ObjectStorageError, match="Invalid S3"):
        S3ObjectStorage().delete(key)
    client.delete_object.assert_not_called()
