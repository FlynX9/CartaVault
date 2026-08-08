import pytest

from app.annotations.schemas import validate_geometry


@pytest.mark.parametrize(("shape", "geometry", "radius"), [
    ("circle", {"type": "Point", "coordinates": [2.35, 48.85]}, 100),
    ("rectangle", {"type": "Polygon", "coordinates": [[[2, 48], [3, 48], [3, 49], [2, 49], [2, 48]]]}, None),
    ("triangle", {"type": "Polygon", "coordinates": [[[2, 48], [3, 48], [2.5, 49], [2, 48]]]}, None),
    ("line", {"type": "LineString", "coordinates": [[2, 48], [3, 49]]}, None),
    ("path", {"type": "LineString", "coordinates": [[2, 48], [3, 49], [4, 50]]}, None),
])
def test_validate_geometry_accepts_supported_shapes(shape, geometry, radius):
    validate_geometry(shape, geometry, radius)


def test_validate_geometry_rejects_a_circle_without_radius():
    with pytest.raises(ValueError, match="radius"):
        validate_geometry("circle", {"type": "Point", "coordinates": [2.35, 48.85]}, None)


def test_validate_geometry_rejects_an_open_polygon():
    with pytest.raises(ValueError, match="closed polygon"):
        validate_geometry("triangle", {"type": "Polygon", "coordinates": [[[2, 48], [3, 48], [2.5, 49], [2.4, 48.5]]]}, None)
