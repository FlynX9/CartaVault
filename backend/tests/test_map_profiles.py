from app.categories.models import Category
from app.map_profiles.catalog import EXPECTED_PROFILE_IDS, PROFILE_CATALOG, public_profiles
from app.statuses.models import PlaceStatus


def test_profile_catalog_is_complete_ordered_and_localized() -> None:
    assert tuple(profile["id"] for profile in PROFILE_CATALOG) == EXPECTED_PROFILE_IDS
    assert [(len(profile["categories"]), len(profile["tags"]), len(profile["statuses"])) for profile in PROFILE_CATALOG] == [
        (7, 3, 5), (20, 25, 9), (20, 30, 9), (25, 27, 10),
        (18, 26, 8), (19, 25, 8), (17, 18, 8), (11, 17, 8), (0, 0, 0),
    ]
    french, english = public_profiles("fr"), public_profiles("en")
    assert french[0].name == "Général"
    assert french[0].statuses[0].name == "À faire"
    assert english[0].statuses[0].name == "To do"
    assert french[0].statuses[0].color == "#3B82F6"
    assert french[0].categories[0].icon_id == "material-symbols:location-on-outline"
    assert french[-1].categories == french[-1].tags == french[-1].statuses == []


def test_import_profile_categories_skips_existing_names(integration_client, poi_map, database_session) -> None:
    existing_category = public_profiles("fr")[0].categories[0]
    database_session.add(Category(map_id=poi_map.id, name=f"  {existing_category.name.upper()}  ", icon=existing_category.icon_id))
    database_session.commit()

    response = integration_client.post(
        "/map-profiles/general/import",
        json={"map_id": str(poi_map.id), "resource_type": "categories"},
    )

    assert response.status_code == 200
    assert response.json() == {"created": 6, "skipped": 1}
    assert database_session.query(Category).filter_by(map_id=poi_map.id).count() == 7


def test_import_profile_category_with_same_name_and_different_icon_is_created(
    integration_client, poi_map, database_session,
) -> None:
    profile_category = public_profiles("fr")[0].categories[0]
    database_session.add(Category(map_id=poi_map.id, name=profile_category.name, icon="mdi:church"))
    database_session.commit()

    response = integration_client.post(
        "/map-profiles/general/import",
        json={
            "map_id": str(poi_map.id),
            "resource_type": "categories",
            "selected_keys": [profile_category.key],
        },
    )

    assert response.status_code == 200
    assert response.json() == {"created": 1, "skipped": 0}


def test_import_profile_statuses_preserves_current_default_and_is_idempotent(
    integration_client, poi_map, database_session,
) -> None:
    original_default_id = database_session.query(PlaceStatus).filter_by(map_id=poi_map.id, is_default=True).one().id

    first = integration_client.post(
        "/map-profiles/urbex/import",
        json={"map_id": str(poi_map.id), "resource_type": "statuses"},
    )
    second = integration_client.post(
        "/map-profiles/urbex/import",
        json={"map_id": str(poi_map.id), "resource_type": "statuses"},
    )

    assert first.status_code == second.status_code == 200
    assert first.json()["created"] > 0
    assert second.json() == {"created": 0, "skipped": 9}
    database_session.expire_all()
    defaults = database_session.query(PlaceStatus).filter_by(map_id=poi_map.id, is_default=True).all()
    assert [item.id for item in defaults] == [original_default_id]
