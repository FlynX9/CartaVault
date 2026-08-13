import re
import unicodedata
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.categories.models import Category
from app.map_profiles.catalog import PROFILE_BY_ID
from app.map_profiles.schemas import StarterProfileOptions, StarterProfileResourceType
from app.statuses.models import PlaceStatus
from app.statuses.service import create_default_statuses
from app.tags.models import Tag


def _normalized_name(value: str) -> str:
    return unicodedata.normalize("NFKC", value).strip().casefold()


def _status_slug(value: str) -> str:
    ascii_name = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode("ascii")
    return re.sub(r"[^a-z0-9]+", "-", ascii_name.lower()).strip("-")[:100] or "statut"


def import_profile_resources(
    database_session: Session,
    map_id: UUID,
    profile_id: str,
    resource_type: StarterProfileResourceType,
    locale: str,
    selected_keys: list[str] | None = None,
) -> tuple[int, int]:
    """Append one profile resource type while preserving every existing item."""

    profile = PROFILE_BY_ID[profile_id]
    language = "en" if locale == "en" else "fr"
    definitions = profile[resource_type]
    if selected_keys is not None:
        selected = set(selected_keys)
        definitions = [definition for definition in definitions if definition["key"] in selected]
    model = {"categories": Category, "tags": Tag, "statuses": PlaceStatus}[resource_type]
    existing = list(database_session.scalars(select(model).where(model.map_id == map_id)))
    names = {_normalized_name(item.name) for item in existing}
    category_signatures = {
        (_normalized_name(item.name), item.icon)
        for item in existing
    } if resource_type == "categories" else set()
    created = 0

    if resource_type == "statuses":
        used_slugs = {item.slug for item in existing}
        next_order = int(database_session.scalar(select(func.max(PlaceStatus.sort_order)).where(PlaceStatus.map_id == map_id)) or 0)

    for definition in definitions:
        name = definition["name"][language]
        aliases = {_normalized_name(name)}
        if resource_type == "categories":
            is_duplicate = any((alias, definition["icon_id"]) in category_signatures for alias in aliases)
        else:
            is_duplicate = bool(aliases & names)
        if is_duplicate:
            continue
        if resource_type == "categories":
            item = Category(map_id=map_id, name=name, icon=definition["icon_id"])
        elif resource_type == "tags":
            item = Tag(map_id=map_id, name=name, color=definition["color"])
        else:
            base_slug = _status_slug(name)
            slug = base_slug
            suffix = 2
            while slug in used_slugs:
                suffix_text = f"-{suffix}"
                slug = f"{base_slug[:100 - len(suffix_text)].rstrip('-')}{suffix_text}"
                suffix += 1
            used_slugs.add(slug)
            next_order += 10
            item = PlaceStatus(
                map_id=map_id, name=name, slug=slug, color=definition["color"],
                functional_state=definition["functional_state"], sort_order=next_order,
                is_default=False, is_active=True,
            )
        database_session.add(item)
        names.update(aliases)
        if resource_type == "categories":
            category_signatures.update((alias, definition["icon_id"]) for alias in aliases)
        created += 1

    return created, len(definitions) - created


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
