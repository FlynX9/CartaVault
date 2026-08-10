import pytest

from app.media.router import _read_xmp_gps


pytestmark = pytest.mark.unit


def test_reads_gps_from_android_xmp_metadata() -> None:
    payload = b'''<x:xmpmeta xmlns:exif="http://ns.adobe.com/exif/1.0/">
      <rdf:Description exif:GPSLatitude="41,7167N" exif:GPSLongitude="44,7833E" />
    </x:xmpmeta>'''

    latitude, longitude = _read_xmp_gps(payload) or (None, None)

    assert latitude == pytest.approx(41.7167)
    assert longitude == pytest.approx(44.7833)


def test_rejects_invalid_xmp_coordinates() -> None:
    assert _read_xmp_gps(b'<rdf:Description exif:GPSLatitude="99N" exif:GPSLongitude="44E" />') is None
