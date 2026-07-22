import pytest
from pydantic import ValidationError
from uuid import uuid4

from app.statuses.router import slugify_status_name
from app.statuses.schemas import PlaceStatusCreate, PlaceStatusUpdate


pytestmark = pytest.mark.unit


def test_status_values_are_normalized() -> None:
    map_id = uuid4()
    payload = PlaceStatusCreate(
        map_id=map_id,
        name="  À vérifier  ",
        color=" #d97706 ",
        functional_state="non_visited",
    )

    assert payload.map_id == map_id
    assert payload.name == "À vérifier"
    assert payload.color == "#D97706"
    assert payload.functional_state == "non_visited"
    assert slugify_status_name(payload.name) == "a-verifier"


@pytest.mark.parametrize("color", ["red", "#12345", "#GG0000", "#1234567"])
def test_status_color_must_be_strict_hex(color: str) -> None:
    with pytest.raises(ValidationError):
        PlaceStatusCreate(
            map_id=uuid4(),
            name="Test",
            color=color,
            functional_state="non_visited",
        )


def test_status_update_rejects_null_and_inactive_default() -> None:
    with pytest.raises(ValidationError):
        PlaceStatusUpdate(name=None)

    with pytest.raises(ValidationError):
        PlaceStatusCreate(
            map_id=uuid4(),
            name="Default",
            color="#123456",
            functional_state="visited",
            is_default=True,
            is_active=False,
        )


def test_status_functional_state_is_required_and_strict() -> None:
    with pytest.raises(ValidationError):
        PlaceStatusCreate(map_id=uuid4(), name="Test", color="#123456")

    with pytest.raises(ValidationError):
        PlaceStatusCreate(
            map_id=uuid4(),
            name="Test",
            color="#123456",
            functional_state="unknown",
        )
