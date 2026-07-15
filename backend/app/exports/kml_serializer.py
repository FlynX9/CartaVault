"""Safe KML 2.2 serialization for a CartaVault export."""

from __future__ import annotations

import html
import json
from xml.etree import ElementTree as ET

KML_NAMESPACE = "http://www.opengis.net/kml/2.2"
ET.register_namespace("", KML_NAMESPACE)


def build_kml(map_name: str, placemarks: list[dict[str, object]], styles: dict[str, str]) -> bytes:
    root = ET.Element(f"{{{KML_NAMESPACE}}}kml")
    document = ET.SubElement(root, "Document")
    ET.SubElement(document, "name").text = map_name
    ET.SubElement(document, "description").text = "Export CartaVault"
    for style_id, icon_path in styles.items():
        style = ET.SubElement(document, "Style", {"id": style_id})
        icon_style = ET.SubElement(style, "IconStyle")
        ET.SubElement(icon_style, "scale").text = "1.15"
        icon = ET.SubElement(icon_style, "Icon")
        ET.SubElement(icon, "href").text = icon_path
        ET.SubElement(
            icon_style,
            "hotSpot",
            {"x": "0.5", "y": "0", "xunits": "fraction", "yunits": "fraction"},
        )
    folder = ET.SubElement(document, "Folder")
    ET.SubElement(folder, "name").text = map_name
    for item in placemarks:
        placemark = ET.SubElement(folder, "Placemark")
        ET.SubElement(placemark, "name").text = str(item["name"])
        description = item.get("description")
        if description:
            ET.SubElement(placemark, "description").text = str(description)
        # Google Earth follows the KML Feature sequence. It may ignore a
        # styleUrl that appears before the feature name/description.
        if item.get("style_id"):
            ET.SubElement(placemark, "styleUrl").text = f"#{item['style_id']}"
        extended_data = item.get("extended_data")
        if extended_data:
            node = ET.SubElement(placemark, "ExtendedData")
            for key, value in dict(extended_data).items():
                data = ET.SubElement(node, "Data", {"name": str(key)})
                ET.SubElement(data, "value").text = value if isinstance(value, str) else json.dumps(value, ensure_ascii=False, separators=(",", ":"))
        point = ET.SubElement(placemark, "Point")
        ET.SubElement(point, "coordinates").text = f"{item['longitude']},{item['latitude']},0"
    return ET.tostring(root, encoding="utf-8", xml_declaration=True)


def safe_description(description: str | None, image_path: str | None) -> str | None:
    parts: list[str] = []
    if description:
        parts.append(f"<p>{html.escape(description)}</p>")
    if image_path:
        parts.append(f'<img src="{html.escape(image_path, quote=True)}" />')
    return "".join(parts) or None
