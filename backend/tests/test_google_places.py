import json

from app.places.google_places import search_google_places


class Response:
    status = 200

    def __init__(self, payload: dict):
        self.payload = payload

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return None

    def read(self, _limit: int) -> bytes:
        return json.dumps(self.payload).encode()


def test_google_places_text_search_is_server_side_and_normalized(monkeypatch) -> None:
    captured = []
    payload = {"places": [{
        "id": "panorama-id",
        "displayName": {"text": "Panorama Boutique Hotel"},
        "formattedAddress": "13 Samreklo Street, 0103 Tbilisi, Georgia",
        "location": {"latitude": 41.697122, "longitude": 44.8135},
        "addressComponents": [
            {"longText": "Tbilisi", "shortText": "Tbilisi", "types": ["locality"]},
            {"longText": "0103", "shortText": "0103", "types": ["postal_code"]},
            {"longText": "Georgia", "shortText": "GE", "types": ["country"]},
        ],
    }]}
    monkeypatch.setattr("app.places.google_places.urlopen", lambda request, **_kwargs: captured.append(request) or Response(payload))

    results = search_google_places("secret-google-key", "Panorama Boutique Hotel, 13 Samreklo Street", "GE")

    assert len(results) == 1
    assert results[0].latitude == 41.697122 and results[0].longitude == 44.8135
    assert results[0].country_code == "GE" and results[0].postal_code == "0103"
    request = captured[0]
    assert request.full_url == "https://places.googleapis.com/v1/places:searchText"
    assert request.headers["X-goog-api-key"] == "secret-google-key"
    assert json.loads(request.data)["regionCode"] == "GE"
