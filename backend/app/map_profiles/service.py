from uuid import UUID

from sqlalchemy.orm import Session

from app.categories.models import Category
from app.map_profiles.catalog import PROFILE_BY_ID
from app.map_profiles.schemas import StarterProfileOptions
from app.statuses.models import PlaceStatus
from app.statuses.service import create_default_statuses
from app.tags.models import Tag


def profile_resource_counts(profile_id: str, options: StarterProfileOptions) -> tuple[int, int, int]:
    profile = PROFILE_BY_ID[profile_id]
    if profile_id == "custom":
        return 0, 0, 4
    return (
        len(profile["categories"]) if options.categories else 0,
        len(profile["tags"]) if options.tags else 0,
        len(profile["statuses"]) if options.statuses else 4,
    )


def initialize_map_profile(
    database_session: Session,
    map_id: UUID,
    profile_id: str,
    options: StarterProfileOptions,
    locale: str,
) -> None:
    """Materialize a profile once; no profile identity is stored on the map."""

    profile = PROFILE_BY_ID[profile_id]
    language = "en" if locale == "en" else "fr"
    if profile_id != "custom" and options.categories:
        database_session.add_all([
            Category(map_id=map_id, name=item["name"][language], icon=item["icon_id"])
            for item in profile["categories"]
        ])
    if profile_id != "custom" and options.tags:
        database_session.add_all([
            Tag(map_id=map_id, name=item["name"][language], color=item["color"])
            for item in profile["tags"]
        ])
    if profile_id == "custom" or not options.statuses:
        create_default_statuses(database_session, map_id)
        return
    database_session.add_all([
        PlaceStatus(
            map_id=map_id, name=item["name"][language], slug=item["key"].replace("_", "-"),
            color=item["color"], functional_state=item["functional_state"],
            sort_order=item["sort_order"], is_default=item["key"] == profile["default_status_key"], is_active=True,
        )
        for item in profile["statuses"]
    ])
