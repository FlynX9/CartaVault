from uuid import uuid4

import pytest
from pydantic import ValidationError

from app.tags.schemas import DEFAULT_TAG_COLOR, TagCreate, TagUpdate


pytestmark = pytest.mark.unit


def test_tag_color_defaults_and_normalizes() -> None:
    assert TagCreate(map_id=uuid4(), name="Historique").color == DEFAULT_TAG_COLOR
    assert TagCreate(map_id=uuid4(), name="Historique", color="#abcdef").color == "#ABCDEF"


def test_tag_color_rejects_invalid_or_null_values() -> None:
    with pytest.raises(ValidationError):
        TagCreate(map_id=uuid4(), name="Historique", color="red")

    with pytest.raises(ValidationError):
        TagUpdate(color=None)
