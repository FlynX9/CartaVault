from __future__ import annotations

import re
from datetime import UTC, datetime
from urllib.parse import urlencode
from uuid import UUID
from xml.etree import ElementTree as ET
from zipfile import ZIP_DEFLATED, ZipFile

from app.exports.temporary_exports import TemporaryExport, create
from app.trips.models import Trip


def google_maps_links(trip: Trip, max_points: int = 10) -> list[dict]:
    links: list[dict] = []
    for day in trip.days:
        start = day.previous_night or (getattr(trip, "departure", None) if day.day_number == 1 else None)
        points = ([start] if start else []) + list(day.stops) + ([day.next_night] if day.next_night else [])
        if len(points) < 2: continue
        chunks = [points[index:index + max_points] for index in range(0, len(points) - 1, max_points - 1)]
        for index, chunk in enumerate(chunks, 1):
            if len(chunk) < 2: continue
            parameters = {"api": "1", "origin": f"{chunk[0].latitude},{chunk[0].longitude}", "destination": f"{chunk[-1].latitude},{chunk[-1].longitude}", "travelmode": "driving"}
            if len(chunk) > 2: parameters["waypoints"] = "|".join(f"{item.latitude},{item.longitude}" for item in chunk[1:-1])
            links.append({"day_id": str(day.id), "day_number": day.day_number, "part": index, "stops": len(chunk), "url": f"https://www.google.com/maps/dir/?{urlencode(parameters)}"})
    return links


def create_gpx(trip: Trip, user_id: UUID) -> TemporaryExport:
    item = create(trip.map_id, user_id, f"{_slug(trip.name)}.gpx")
    root = ET.Element("gpx", {"version": "1.1", "creator": "CartaVault", "xmlns": "http://www.topografix.com/GPX/1/1"})
    ET.SubElement(root, "name").text = trip.name
    for day in trip.days:
        route = ET.SubElement(root, "rte"); ET.SubElement(route, "name").text = day.title or f"Jour {day.day_number}"
        start = day.previous_night or (getattr(trip, "departure", None) if day.day_number == 1 else None)
        points = ([start] if start else []) + list(day.stops) + ([day.next_night] if day.next_night else [])
        for stop in points:
            node = ET.SubElement(route, "rtept", {"lat": str(stop.latitude), "lon": str(stop.longitude)})
            ET.SubElement(node, "name").text = stop.name
            notes = getattr(stop, "notes", None)
            if notes: ET.SubElement(node, "desc").text = notes
    item.path.write_bytes(ET.tostring(root, encoding="utf-8", xml_declaration=True))
    return item


def create_kmz(trip: Trip, user_id: UUID) -> TemporaryExport:
    item = create(trip.map_id, user_id, f"{_slug(trip.name)}.kmz")
    namespace = "http://www.opengis.net/kml/2.2"; ET.register_namespace("", namespace)
    root = ET.Element(f"{{{namespace}}}kml"); document = ET.SubElement(root, "Document"); ET.SubElement(document, "name").text = trip.name
    colors = ["ff8aa60f", "ff4a7cc8", "ffb05e8a", "ff8a5ec8", "ff3e9bde"]
    for day_index, day in enumerate(trip.days):
        style_id = f"day-{day.day_number}"; style = ET.SubElement(document, "Style", {"id": style_id}); line = ET.SubElement(style, "LineStyle"); ET.SubElement(line, "color").text = colors[day_index % len(colors)]; ET.SubElement(line, "width").text = "4"
        folder = ET.SubElement(document, "Folder"); ET.SubElement(folder, "name").text = day.title or f"Jour {day.day_number}"
        start = day.previous_night or (getattr(trip, "departure", None) if day.day_number == 1 else None)
        points = ([start] if start else []) + list(day.stops) + ([day.next_night] if day.next_night else [])
        for index, stop in enumerate(points, 1):
            mark = ET.SubElement(folder, "Placemark"); ET.SubElement(mark, "name").text = f"{index}. {stop.name}"
            data_node = ET.SubElement(mark, "ExtendedData")
            for key, value in {"type": getattr(stop, "stop_type", "hotel"), "visit_status": getattr(stop, "visit_status", "planned"), "notes": getattr(stop, "notes", None)}.items():
                if value is None: continue
                data = ET.SubElement(data_node, "Data", {"name": key}); ET.SubElement(data, "value").text = str(value)
            point = ET.SubElement(mark, "Point"); ET.SubElement(point, "coordinates").text = f"{stop.longitude},{stop.latitude},0"
        if day.route_geometry and day.route_geometry.get("coordinates"):
            route = ET.SubElement(folder, "Placemark"); ET.SubElement(route, "name").text = "Itinéraire"; ET.SubElement(route, "styleUrl").text = f"#{style_id}"; line_string = ET.SubElement(route, "LineString"); ET.SubElement(line_string, "tessellate").text = "1"; ET.SubElement(line_string, "coordinates").text = " ".join(f"{lon},{lat},0" for lon, lat in day.route_geometry["coordinates"])
    with ZipFile(item.path, "w", ZIP_DEFLATED) as archive: archive.writestr("doc.kml", ET.tostring(root, encoding="utf-8", xml_declaration=True))
    return item


def _slug(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")[:80] or f"voyage-{datetime.now(UTC).date()}"
