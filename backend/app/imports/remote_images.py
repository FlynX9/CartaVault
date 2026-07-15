"""Anonymous, SSRF-safe retrieval of the single supported My Maps host."""

from __future__ import annotations

import http.client
import ipaddress
import socket
from dataclasses import dataclass
from urllib.parse import urljoin, urlsplit

from app.photos.storage import MAX_PHOTO_SIZE, detect_photo_media_type

ALLOWED_REMOTE_IMAGE_HOST = "mymaps.usercontent.google.com"
MAX_REDIRECTS = 3
REMOTE_TIMEOUT_SECONDS = 8


class RemoteImageError(ValueError):
    """A remote image cannot safely be retrieved anonymously."""


@dataclass(frozen=True)
class DownloadedRemoteImage:
    payload: bytes
    mime_type: str


def validate_remote_image_url(value: str) -> str:
    parts = urlsplit(value)
    if (
        parts.scheme != "https"
        or parts.hostname != ALLOWED_REMOTE_IMAGE_HOST
        or parts.username is not None
        or parts.password is not None
        or parts.port not in {None, 443}
    ):
        raise RemoteImageError("The remote image URL is not supported")
    _validate_public_dns(parts.hostname)
    return parts.geturl()


def download_remote_image(value: str) -> DownloadedRemoteImage:
    """Download one supported image, revalidating every redirect target."""

    current_url = validate_remote_image_url(value)
    for _ in range(MAX_REDIRECTS + 1):
        parts = urlsplit(current_url)
        connection = http.client.HTTPSConnection(parts.hostname, 443, timeout=REMOTE_TIMEOUT_SECONDS)
        try:
            path = parts.path or "/"
            if parts.query:
                path = f"{path}?{parts.query}"
            connection.request("GET", path, headers={"Accept": "image/jpeg,image/png,image/webp"})
            response = connection.getresponse()
            if response.status in {301, 302, 303, 307, 308}:
                location = response.getheader("Location")
                if not location:
                    raise RemoteImageError("The remote image redirect is invalid")
                current_url = validate_remote_image_url(urljoin(current_url, location))
                continue
            if response.status != 200:
                raise RemoteImageError("The remote image is not accessible anonymously")
            content_length = response.getheader("Content-Length")
            if content_length is not None and int(content_length) > MAX_PHOTO_SIZE:
                raise RemoteImageError("The remote image exceeds the size limit")
            chunks: list[bytes] = []
            size = 0
            while chunk := response.read(1024 * 1024):
                size += len(chunk)
                if size > MAX_PHOTO_SIZE:
                    raise RemoteImageError("The remote image exceeds the size limit")
                chunks.append(chunk)
            payload = b"".join(chunks)
            mime_type = detect_photo_media_type(payload[:16])
            if mime_type is None:
                raise RemoteImageError("The remote response is not a supported image")
            return DownloadedRemoteImage(payload=payload, mime_type=mime_type)
        except (OSError, ValueError, http.client.HTTPException) as error:
            if isinstance(error, RemoteImageError):
                raise
            raise RemoteImageError("The remote image could not be downloaded") from error
        finally:
            connection.close()
    raise RemoteImageError("The remote image redirect limit was reached")


def _validate_public_dns(hostname: str) -> None:
    try:
        addresses = socket.getaddrinfo(hostname, 443, type=socket.SOCK_STREAM)
    except OSError as error:
        raise RemoteImageError("The remote image host could not be resolved") from error
    if not addresses:
        raise RemoteImageError("The remote image host could not be resolved")
    for _, _, _, _, address in addresses:
        if not ipaddress.ip_address(address[0]).is_global:
            raise RemoteImageError("The remote image host resolved to a forbidden address")
