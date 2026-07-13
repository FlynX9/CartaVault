import pytest
from pydantic import ValidationError

from app.statuses.router import slugify_status_name
from app.statuses.schemas import PlaceStatusCreate, PlaceStatusUpdate


pytestmark = pytest.mark.unit


def test_status_values_are_normalized() -> None:
    payload = PlaceStatusCreate(name="  À vérifier  ", color=" #d97706 ")

    assert payload.name == "À vérifier"
    assert payload.color == "#D97706"
    assert slugify_status_name(payload.name) == "a-verifier"


@pytest.mark.parametrize("color", ["red", "#12345", "#GG0000", "#1234567"])
def test_status_color_must_be_strict_hex(color: str) -> None:
    with pytest.raises(ValidationError):
        PlaceStatusCreate(name="Test", color=color)


def test_status_update_rejects_null_and_inactive_default() -> None:
    with pytest.raises(ValidationError):
        PlaceStatusUpdate(name=None)

    with pytest.raises(ValidationError):
        PlaceStatusCreate(
            name="Default",
            color="#123456",
            is_default=True,
            is_active=False,
        )
