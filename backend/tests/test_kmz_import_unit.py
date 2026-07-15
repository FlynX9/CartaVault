from io import BytesIO
from uuid import uuid4
from zipfile import ZIP_DEFLATED, ZipFile

import pytest

from app.imports.kmz_mapping import map_extended_data
from app.imports.kmz_parser import KmzParseError, ParsedPlacemark, parse_kmz
from app.imports.kmz_security import KmzSecurityError, validate_kmz_upload
from app.imports.service import mark_duplicate_items, preview_to_read


def make_kmz(files: dict[str, bytes]) -> bytes:
    output = BytesIO()
    with ZipFile(output, "w", ZIP_DEFLATED) as archive:
        for name, content in files.items():
            archive.writestr(name, content)
    return output.getvalue()


def test_kmz_parser_reads_point_extended_data_html_and_image() -> None:
    image = b"\x89PNG\r\n\x1a\nminimal"
    archive = validate_kmz_upload("places.kmz", make_kmz({
        "doc.kml": b'''<kml><Document><Folder><name>Archive</name><Placemark><name>Tour</name><description><![CDATA[<p>Texte <img src="files/photo.png"></p><script>x</script>]]></description><ExtendedData><Data name="R\xc3\xa9gion"><value>Lorraine</value></Data><Data name="Architecte"><value>Jeanne</value></Data></ExtendedData><Point><coordinates>6.15,48.2,250</coordinates></Point></Placemark></Folder></Document></kml>''',
        "files/photo.png": image,
    }))
    try:
        items, warnings = parse_kmz(archive.archive, tuple(entry.filename for entry in archive.entries))
    finally:
        archive.archive.close()
    assert warnings == []
    assert len(items) == 1
    assert items[0].folder_name == "Archive"
    assert items[0].description == "Texte"
    assert items[0].longitude == 6.15
    assert items[0].latitude == 48.2
    assert items[0].altitude == 250
    assert items[0].images[0].mime_type == "image/png"
    mapped, custom = map_extended_data(items[0].extended_data, name=items[0].name, description=items[0].description)
    assert mapped["region"] == "Lorraine"
    assert custom == {"Région": "Lorraine", "Architecte": "Jeanne"}


def test_kmz_rejects_zip_slip_and_nested_archives() -> None:
    with pytest.raises(KmzSecurityError, match="unsafe"):
        validate_kmz_upload("unsafe.kmz", make_kmz({"../outside.kml": b"x"}))
    with pytest.raises(KmzSecurityError, match="Nested"):
        validate_kmz_upload("nested.kmz", make_kmz({"doc.kml": b"<kml/>", "nested.zip": b"not parsed"}))


def test_kmz_parser_rejects_missing_kml_and_unsafe_xml() -> None:
    archive = validate_kmz_upload("none.kmz", make_kmz({"readme.txt": b"none"}))
    with pytest.raises(KmzParseError, match="does not contain"):
        parse_kmz(archive.archive, tuple(entry.filename for entry in archive.entries))
    archive.archive.close()
    archive = validate_kmz_upload("unsafe.kmz", make_kmz({"doc.kml": b'<!DOCTYPE foo [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><kml><Placemark><Point><coordinates>1,2</coordinates></Point></Placemark></kml>'}))
    with pytest.raises(KmzParseError, match="forbidden|unsafe"):
        parse_kmz(archive.archive, tuple(entry.filename for entry in archive.entries))
    archive.archive.close()


def test_mapping_preserves_duplicate_unknown_fields_in_order() -> None:
    mapped, custom = map_extended_data([("Nom", "Titre"), ("Architecte", "A"), ("Architecte", "B")], name=None, description=None)
    assert mapped == {"name": "Titre"}
    assert custom == {"Nom": "Titre", "Architecte": ["A", "B"]}


def test_kmz_parser_ignores_technical_nodes_outside_extended_data() -> None:
    archive = validate_kmz_upload("places.kmz", make_kmz({
        "doc.kml": b'''<kml xmlns:gx="http://www.google.com/kml/ext/2.2"><Placemark><name>Tour</name><gx:SimpleData name="gx_media_links">technical</gx:SimpleData><ExtendedData><Data name="Etat"><value>Mort</value></Data></ExtendedData><Point><coordinates>2.35,48.85</coordinates></Point></Placemark></kml>''',
    }))
    try:
        items, _warnings = parse_kmz(archive.archive, tuple(entry.filename for entry in archive.entries))
    finally:
        archive.archive.close()

    assert items[0].extended_data == [("Etat", "Mort")]


def test_kmz_preview_marks_map_and_file_duplicates(monkeypatch: pytest.MonkeyPatch) -> None:
    first = ParsedPlacemark(0, "Town Hall", None, 48.8566, 2.3522)
    existing = ParsedPlacemark(1, " town hall ", None, 48.8566001, 2.3521999)
    repeated = ParsedPlacemark(2, "TOWN HALL", None, 48.8566, 2.3522)

    monkeypatch.setattr(
        "app.imports.service._find_existing_duplicate",
        lambda _session, _map_id, item: "existing-place" if item is existing else None,
    )

    mark_duplicate_items(object(), object(), [first, existing, repeated])
    preview = preview_to_read(type("Cached", (), {
        "import_id": uuid4(),
        "file_name": "places.kmz",
        "items": (first, existing, repeated),
        "global_warnings": (),
    })())

    assert preview.valid_count == 1
    assert preview.items[0].already_imported is False
    assert preview.items[1].already_imported is True
    assert preview.items[2].already_imported is True
    assert preview.items[1].selected_by_default is False
    assert preview.items[2].selected_by_default is False
