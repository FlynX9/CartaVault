from uuid import uuid4


def test_categories_and_tags_can_be_reordered(integration_client, poi_map) -> None:
    map_id = str(poi_map.id)
    category_ids = [
        integration_client.post(
            "/categories",
            json={"map_id": map_id, "name": f"Ordered category {uuid4().hex}"},
        ).json()["id"]
        for _ in range(3)
    ]
    tag_ids = [
        integration_client.post(
            "/tags",
            json={"map_id": map_id, "name": f"Ordered tag {uuid4().hex}"},
        ).json()["id"]
        for _ in range(3)
    ]

    all_categories = integration_client.get("/categories", params={"map_id": map_id}).json()
    all_tags = integration_client.get("/tags", params={"map_id": map_id}).json()
    reordered_categories = [item["id"] for item in all_categories if item["id"] not in category_ids] + list(reversed(category_ids))
    reordered_tags = [item["id"] for item in all_tags if item["id"] not in tag_ids] + list(reversed(tag_ids))

    category_response = integration_client.post(
        "/categories/reorder",
        params={"map_id": map_id},
        json={"ids": reordered_categories},
    )
    tag_response = integration_client.post(
        "/tags/reorder",
        params={"map_id": map_id},
        json={"ids": reordered_tags},
    )

    assert category_response.status_code == 200
    assert tag_response.status_code == 200
    assert [item["id"] for item in category_response.json()] == reordered_categories
    assert [item["id"] for item in tag_response.json()] == reordered_tags
    assert [item["id"] for item in integration_client.get("/categories", params={"map_id": map_id}).json()] == reordered_categories
    assert [item["id"] for item in integration_client.get("/tags", params={"map_id": map_id}).json()] == reordered_tags

    assert integration_client.post(
        "/categories/reorder",
        params={"map_id": map_id},
        json={"ids": reordered_categories[:-1]},
    ).status_code == 422
