"""Deterministic and network-free parsing of validated KMZ archives."""

from __future__ import annotations

import html
from dataclasses import dataclass, field
from html.parser import HTMLParser
from pathlib import PurePosixPath
from typing import Iterable
from zipfile import ZipFile

try:
    from defusedxml import ElementTree as SafeElementTree
    from defusedxml.common import DefusedXmlException
except ImportError:  # pragma: no cover - keeps a running API safe before dependency deployment
    from xml.etree import ElementTree as SafeElementTree

    DefusedXmlException = SafeElementTree.ParseError

from app.imports.kmz_security import KMZ_MAX_IMAGES, KMZ_MAX_PLACEMARKS, KmzSecurityError
from app.photos.storage import detect_photo_media_type


class KmzParseError(ValueError):
    """Raised when a validated archive has no usable KML document."""


@dataclass(frozen=True)
class ParsedImage:
    internal_id: str
    original_name: str
    mime_type: str
    size: int
    payload: bytes | None = None
    source_type: str = "embedded"
    host: str | None = None
    remote_url: str | None = None


@dataclass
class ParsedPlacemark:
    source_index: int
    name: str | None
    description: str | None
    latitude: float | None
    longitude: float | None
    altitude: float | None = None
    extended_data: list[tuple[str, str]] = field(default_factory=list)
    folder_name: str | None = None
    style_url: str | None = None
    images: list[ParsedImage] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)
    duplicate_place_id: str | None = None


class _DescriptionTextExtractor(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.parts: list[str] = []
        self.image_sources: list[str] = []
        self._ignored_depth = 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag.lower() in {"script", "style"}:
            self._ignored_depth += 1
        if tag.lower() == "img" and self._ignored_depth == 0:
            source = dict(attrs).get("src")
            if source:
                self.image_sources.append(source)

    def handle_endtag(self, tag: str) -> None:
        if tag.lower() in {"script", "style"} and self._ignored_depth:
            self._ignored_depth -= 1

    def handle_data(self, data: str) -> None:
        if self._ignored_depth == 0:
            self.parts.append(data)


def parse_kmz(archive: ZipFile, entry_names: Iterable[str]) -> tuple[list[ParsedPlacemark], list[str]]:
    """Parse a single deterministic KML document from a previously validated ZIP."""

    names = tuple(entry_names)
    kml_name = _select_kml_name(names)
    raw_kml = archive.read(kml_name)
    if b"<!DOCTYPE" in raw_kml.upper() or b"<!ENTITY" in raw_kml.upper():
        raise KmzParseError("The KML document contains forbidden XML declarations")
    try:
        root = SafeElementTree.fromstring(raw_kml)
    except (DefusedXmlException, ValueError, OSError) as error:
        raise KmzParseError("The KML document is invalid or unsafe") from error

    placemarks = list(_iter_placemarks(root))
    if len(placemarks) > KMZ_MAX_PLACEMARKS:
        raise KmzParseError("The KML document contains too many placemarks")

    warnings: list[str] = []
    kml_files = sorted(name for name in names if name.lower().endswith(".kml"))
    if len(kml_files) > 1:
        warnings.append(f"Several KML files were found; {kml_name} was selected")

    items: list[ParsedPlacemark] = []
    for index, (placemark, folder_name) in enumerate(placemarks):
        item = _parse_placemark(archive, names, kml_name, placemark, index, folder_name)
        if item is not None:
            items.append(item)
    image_count = sum(len(item.images) for item in items)
    if image_count > KMZ_MAX_IMAGES:
        raise KmzParseError("The KMZ archive contains too many supported images")
    if not any(item.latitude is not None and item.longitude is not None for item in items):
        warnings.append("No importable Point placemark was found")
    return items, warnings


def _select_kml_name(names: tuple[str, ...]) -> str:
    kml_names = sorted(name for name in names if name.lower().endswith(".kml"))
    if not kml_names:
        raise KmzParseError("The KMZ archive does not contain a KML document")
    return "doc.kml" if "doc.kml" in kml_names else kml_names[0]


def _iter_placemarks(element, folder_name: str | None = None):
    local_name = _local_name(element.tag)
    current_folder = folder_name
    if local_name == "Folder":
        current_folder = _child_text(element, "name") or folder_name
    if local_name == "Placemark":
        yield element, current_folder
    for child in element:
        yield from _iter_placemarks(child, current_folder)


def _parse_placemark(archive: ZipFile, names: tuple[str, ...], kml_name: str, element, index: int, folder_name: str | None) -> ParsedPlacemark | None:
    point = next((node for node in element.iter() if _local_name(node.tag) == "Point"), None)
    has_geometry = any(_local_name(node.tag) in {"LineString", "Polygon", "MultiGeometry", "NetworkLink", "GroundOverlay"} for node in element.iter())
    if point is None:
        if has_geometry:
            return ParsedPlacemark(source_index=index, name=_child_text(element, "name"), description=None, latitude=None, longitude=None, warnings=["Unsupported geometry: only Point placemarks can be imported"])
        return ParsedPlacemark(source_index=index, name=_child_text(element, "name"), description=None, latitude=None, longitude=None, warnings=["Placemark has no Point coordinates"])

    description, image_sources = _sanitize_description(_child_text(element, "description"))
    item = ParsedPlacemark(
        source_index=index,
        name=_child_text(element, "name"),
        description=description,
        latitude=None,
        longitude=None,
        extended_data=_read_extended_data(element),
        folder_name=folder_name,
        style_url=_child_text(element, "styleUrl"),
    )
    try:
        item.longitude, item.latitude, item.altitude = _parse_coordinates(_child_text(point, "coordinates"))
    except ValueError as error:
        item.errors.append(str(error))
        return item

    for source in image_sources:
        image = _read_image_reference(archive, names, kml_name, source)
        if image is None:
            item.warnings.append(f"Referenced image is unavailable or unsupported: {source}")
        elif len(item.images) < KMZ_MAX_IMAGES:
            item.images.append(image)
            if image.source_type == "remote_supported":
                item.warnings.append("Google My Maps image detected; anonymous access may require Google authentication and can fail")
        else:
            item.warnings.append("The maximum number of images for one import was reached")
    return item


def _sanitize_description(raw: str | None) -> tuple[str | None, list[str]]:
    if not raw:
        return None, []
    parser = _DescriptionTextExtractor()
    parser.feed(raw)
    parser.close()
    text = " ".join(" ".join(parser.parts).split())
    return text or None, parser.image_sources


def _read_extended_data(element) -> list[tuple[str, str]]:
    fields: list[tuple[str, str]] = []
    extended_nodes = (node for node in element.iter() if _local_name(node.tag) == "ExtendedData")
    for extended_node in extended_nodes:
        for node in extended_node.iter():
            node_name = _local_name(node.tag)
            if node_name == "Data":
                key = node.attrib.get("name", "").strip()
                value = _child_text(node, "value")
            elif node_name == "SimpleData":
                key = node.attrib.get("name", "").strip()
                value = (node.text or "").strip()
            else:
                continue
            if key and value:
                fields.append((key, html.unescape(value)))
    return fields


def _read_image_reference(archive: ZipFile, names: tuple[str, ...], kml_name: str, source: str) -> ParsedImage | None:
    from urllib.parse import urlsplit
    remote = urlsplit(source)
    if remote.scheme or remote.netloc:
        if remote.scheme == "https" and remote.hostname == "mymaps.usercontent.google.com":
            return ParsedImage(internal_id=f"remote:{source}", original_name="Google My Maps image", mime_type="", size=0, source_type="remote_supported", host=remote.hostname, remote_url=source)
        return ParsedImage(internal_id=f"remote:{source}", original_name="Remote image", mime_type="", size=0, source_type="remote_unsupported", host=remote.hostname)
    try:
        requested = PurePosixPath(PurePosixPath(kml_name).parent, source)
        if requested.is_absolute() or ".." in requested.parts:
            return None
        resolved = requested.as_posix()
    except (TypeError, ValueError):
        return None
    if resolved not in names:
        return None
    payload = archive.read(resolved)
    media_type = detect_photo_media_type(payload[:16])
    if media_type is None:
        return None
    return ParsedImage(
        internal_id=resolved,
        original_name=PurePosixPath(resolved).name,
        mime_type=media_type,
        size=len(payload),
        payload=payload,
    )


def _parse_coordinates(raw: str | None) -> tuple[float, float, float | None]:
    if not raw:
        raise ValueError("Point coordinates are missing")
    parts = raw.strip().split()[0].split(",")
    if len(parts) < 2:
        raise ValueError("Point coordinates are invalid")
    longitude = float(parts[0])
    latitude = float(parts[1])
    altitude = float(parts[2]) if len(parts) > 2 and parts[2] else None
    if not -180 <= longitude <= 180 or not -90 <= latitude <= 90:
        raise ValueError("Point coordinates are outside valid geographic bounds")
    return longitude, latitude, altitude


def _child_text(element, name: str) -> str | None:
    child = next((node for node in element if _local_name(node.tag) == name), None)
    if child is None or child.text is None:
        return None
    value = child.text.strip()
    return value or None


def _local_name(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]
