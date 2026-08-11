from app.map_profiles.catalog import EXPECTED_PROFILE_IDS, PROFILE_CATALOG, public_profiles


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
