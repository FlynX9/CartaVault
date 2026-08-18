#!/usr/bin/env python3
"""Create and validate the isolated, deterministic CartaVault demo dataset."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import sys
from datetime import date, datetime, time, timedelta
from pathlib import Path
from uuid import UUID, uuid5

from sqlalchemy import func, inspect, select, text
from sqlalchemy.engine import make_url


DEMO_ROOT = Path(__file__).resolve().parents[1]
FIXED_NOW = datetime(2026, 6, 15, 9, 0, 0)
NAMESPACE = UUID("78426079-c109-4976-8b84-aa6b2f060b63")
EXPECTED_DATABASE = "cartavault_demo"
DEFAULT_ALLOWED_HOSTS = {"postgis-demo", "localhost", "127.0.0.1"}
PASSWORD_HASH = "$argon2id$v=19$m=65536,t=3,p=4$Q2FydGFWYXVsdERlbW8hIQ$WUJS/NnLEW8KY8vhr5bxoff8vZFUmxlOCTyq8zmnqaw"
ROUTE_FIXTURES = json.loads((DEMO_ROOT / "data" / "route_geometries.json").read_text(encoding="utf-8"))
PLACE_ASSET_ROOT = DEMO_ROOT / "assets" / "places"
EXPECTED_FRANCE_ASSETS = tuple(f"france-{index:02d}.webp" for index in range(1, 31))


def stable_id(kind: str, slug: str) -> UUID:
    return uuid5(NAMESPACE, f"{kind}:{slug}")


def ensure_demo_target(database_url: str | None = None) -> None:
    """Refuse every destructive command unless all demo guards match."""

    if os.getenv("CARTAVAULT_DEMO_MODE", "").strip().lower() != "true":
        raise RuntimeError("Refusing reset: CARTAVAULT_DEMO_MODE must be exactly 'true'.")
    url = make_url(database_url or os.getenv("DATABASE_URL", ""))
    allowed_hosts = {
        value.strip().lower()
        for value in os.getenv("CARTAVAULT_DEMO_DATABASE_HOSTS", ",".join(sorted(DEFAULT_ALLOWED_HOSTS))).split(",")
        if value.strip()
    }
    if url.database != EXPECTED_DATABASE:
        raise RuntimeError(f"Refusing reset: database must be exactly '{EXPECTED_DATABASE}'.")
    if (url.host or "").lower() not in allowed_hosts:
        raise RuntimeError(f"Refusing reset: database host '{url.host}' is not in the demo allowlist.")


def run_migrations() -> None:
    from alembic import command
    from alembic.config import Config

    config = Config("/app/alembic.ini" if Path("/app/alembic.ini").exists() else str(DEMO_ROOT.parent / "backend" / "alembic.ini"))
    command.upgrade(config, "heads")


REGIONS = {
    "france": [
        ("Île-de-France", 48.8566, 2.3522),
        ("Grand Est", 48.5734, 7.7521),
        ("Provence-Alpes-Côte d’Azur", 43.2965, 5.3698),
    ],
    "italy": [
        ("Lombardie", 45.4642, 9.1900),
        ("Toscane", 43.7696, 11.2558),
        ("Latium", 41.9028, 12.4964),
    ],
}

PLACE_NAMES = {
    "france": [
        "Passage des Verrières", "Bibliothèque des Voyageurs", "Jardin des Horloges", "Atelier du Canal",
        "Belvédère des Lumières", "Marché des Créateurs", "Maison des Cartographes", "Galerie du Méridien",
        "Pavillon des Explorateurs", "Café des Archives", "Fort des Brumes", "Parc des Deux Rives",
        "Manufacture des Étoiles", "Musée du Rail Imaginaire", "Chapelle des Vignes", "Halle des Inventeurs",
        "Observatoire de la Plaine", "Sentier des Remparts", "Maison de l’Illustration", "Quai des Bateliers",
        "Villa des Calanques", "Jardin du Mistral", "Atelier des Ocres", "Belvédère du Levant",
        "Maison des Navigateurs", "Marché des Alpilles", "Galerie du Vieux Port", "Sentier des Pins",
        "Pavillon de la Méditerranée", "Café des Voyageuses",
    ],
    "italy": [
        "Officina del Naviglio", "Giardino delle Mappe", "Biblioteca del Viaggio", "Terrazza delle Nuvole",
        "Mercato degli Artigiani", "Casa dei Fotografi", "Museo della Bussola", "Passaggio delle Torri",
        "Padiglione dei Laghi", "Caffè dell’Archivio", "Loggia dei Cartografi", "Giardino dell’Arno",
        "Bottega delle Stampe", "Belvedere delle Colline", "Casa delle Esploratrici", "Mercato delle Ceramiche",
        "Museo del Taccuino", "Sentiero dei Cipressi", "Officina della Luce", "Caffè delle Piazze",
        "Terrazza del Tevere", "Giardino dei Mosaici", "Biblioteca dei Cammini", "Passaggio degli Archi",
        "Casa delle Meridiane", "Mercato delle Fontane", "Museo del Viaggio Lento", "Belvedere Romano",
        "Padiglione delle Strade", "Caffè del Grand Tour",
    ],
}

CATEGORY_NAMES = ["Architecture", "Culture", "Nature", "Gastronomie", "Point de vue"]
STATUS_DEFS = [
    ("À découvrir", "a-decouvrir", "non_visited", "#0FA68A", True),
    ("Planifié", "planifie", "non_visited", "#2563EB", False),
    ("Visité", "visite", "visited", "#7C3AED", False),
]
DAY_COLORS = ["#0FA68A", "#2563EB", "#7C3AED", "#D97706", "#DC2626"]


def _point(longitude: float, latitude: float):
    from geoalchemy2.elements import WKTElement
    return WKTElement(f"POINT({longitude:.6f} {latitude:.6f})", srid=4326)


def _route(stops: list[tuple[float, float]]) -> dict:
    return {"type": "LineString", "coordinates": [[lon, lat] for lat, lon in stops]}


def clear_application_data(session) -> None:
    from app.database import Base
    protected = {"alembic_version", "countries", "quota_profiles"}
    tables = [name for name in inspect(session.bind).get_table_names() if name not in protected]
    if tables:
        quoted = ", ".join(f'"{name}"' for name in sorted(tables))
        session.execute(text(f"TRUNCATE TABLE {quoted} RESTART IDENTITY CASCADE"))
        session.commit()


def validate_project_media_assets() -> list[Path]:
    """Return the immutable France artwork set or fail before touching demo data."""

    assets = [PLACE_ASSET_ROOT / filename for filename in EXPECTED_FRANCE_ASSETS]
    missing = [path.name for path in assets if not path.is_file()]
    if missing:
        raise RuntimeError(f"Demo artwork is incomplete; missing: {', '.join(missing)}")
    return assets


def project_media_assets_by_fixture_id() -> dict[str, Path]:
    """Index every artwork by the stable fixture identifier stored on its POI."""

    return {asset.stem: asset for asset in validate_project_media_assets()}


def create_project_media(session, places_by_map: dict[str, list], uploader_id: UUID) -> None:
    """Copy versioned France artwork into runtime storage and register every image."""

    from app.photos.models import Photo
    from app.photos.storage import get_photo_storage_root

    storage_root = get_photo_storage_root()
    storage_root.mkdir(parents=True, exist_ok=True)
    assets_by_fixture_id = project_media_assets_by_fixture_id()
    for index, place in enumerate(places_by_map["france"]):
        fixture_id = str((place.custom_fields or {}).get("fixture_id", ""))
        asset_path = assets_by_fixture_id.get(fixture_id)
        if asset_path is None:
            raise RuntimeError(f"No demo artwork is associated with POI fixture '{fixture_id or place.id}'.")
        photo_id = stable_id("photo", str(place.id))
        place_directory = storage_root / str(place.id)
        place_directory.mkdir(parents=True, exist_ok=True)
        filename = f"{photo_id}.webp"
        path = place_directory / filename
        shutil.copyfile(asset_path, path)
        session.add(Photo(
            id=photo_id, place_id=place.id, map_id=place.map_id, storage_scope_id=place.id,
            filename=filename, original_name=asset_path.name,
            path=f"{place.id}/{filename}", description=f"Illustration originale du lieu fictif {place.name}.",
            sort_order=0, is_primary=True, mime_type="image/webp", file_size_bytes=path.stat().st_size,
            width=480, height=320, uploaded_by_user_id=uploader_id,
            created_at=FIXED_NOW + timedelta(seconds=index), updated_at=FIXED_NOW + timedelta(seconds=index),
        ))

    # Keep one unattached, geolocated image in the library. It documents the
    # real "Create POI" workflow exposed after GPS metadata has been read.
    gps_photo_id = stable_id("photo", "unattached-gps-demo")
    gps_scope_id = stable_id("photo-scope", "unattached-gps-demo")
    gps_directory = storage_root / str(gps_scope_id)
    gps_directory.mkdir(parents=True, exist_ok=True)
    gps_filename = f"{gps_photo_id}.webp"
    gps_path = gps_directory / gps_filename
    shutil.copyfile(assets_by_fixture_id["france-01"], gps_path)
    session.add(Photo(
        id=gps_photo_id, place_id=None, map_id=places_by_map["france"][0].map_id, storage_scope_id=gps_scope_id,
        latitude=48.85837, longitude=2.294481, filename=gps_filename, original_name="belvedere-paris-gps.webp",
        path=f"{gps_scope_id}/{gps_filename}", description="Photo de démonstration avec coordonnées GPS, prête à créer un POI.",
        sort_order=0, is_primary=False, mime_type="image/webp", file_size_bytes=gps_path.stat().st_size,
        width=480, height=320, uploaded_by_user_id=uploader_id,
        created_at=FIXED_NOW + timedelta(hours=1), updated_at=FIXED_NOW + timedelta(hours=1),
    ))


def seed(session) -> dict[str, object]:
    import app.models  # noqa: F401 - register all mappings
    from app.admin.models import SystemSetting
    from app.annotations.models import AnnotationTemplate, PlaceAnnotation
    from app.auth.credential_encryption import CredentialEncryptionService
    from app.auth.models import AdminApiCredential, User, UserApiCredential, UserSession
    from app.categories.associations import place_categories_table
    from app.categories.models import Category
    from app.countries.models import Country
    from app.maps.models import MapMembership, PoiMap
    from app.places.models import Place, PlaceLink
    from app.quotas.models import QuotaProfile
    from app.statuses.models import PlaceStatus
    from app.tags.models import Tag
    from app.trips.models import Trip, TripArrival, TripDay, TripDeparture, TripNight, TripStop

    users = {}
    user_specs = [
        ("owner", "demo.owner@cartavault.local", "Camille — Propriétaire", True, "fr", "light"),
        ("editor", "demo.editor@cartavault.local", "Andrea — Éditeur", False, "en", "dark"),
        ("viewer", "demo.viewer@cartavault.local", "Morgan — Lecture seule", False, "fr", "light"),
    ]
    for slug, email, name, admin, language, theme in user_specs:
        user = User(
            id=stable_id("user", slug), email=email, display_name=name, password_hash=PASSWORD_HASH,
            is_admin=admin, is_active=True, created_at=FIXED_NOW - timedelta(days=120), updated_at=FIXED_NOW,
            last_login_at=FIXED_NOW - timedelta(hours=2),
            preferences={"language": language, "theme": theme, "default_screen": "dashboard", "display_density": "comfortable"},
        )
        session.add(user)
        users[slug] = user
    session.flush()

    # Keep documentation runs deterministic: opening a map must not launch a
    # country generation job. The administrator-triggered state is what the
    # vector-basemap documentation is intended to illustrate.
    session.add(SystemSetting(key="vector_basemap", value={
        "enabled": True,
        "preparation_policy": "manual",
        "update_policy": "disabled",
        "min_zoom": 0,
        "max_zoom": 14,
        "offline_min_zoom": 5,
        "offline_max_zoom": 14,
        "offline_padding_km": 20,
        "offline_max_tiles": 25_000,
    }))

    demo_quota_id = stable_id("quota-profile", "voyageur")
    demo_quota = session.get(QuotaProfile, demo_quota_id)
    if demo_quota is None:
        demo_quota = QuotaProfile(
            id=demo_quota_id,
            name="Voyageur",
            description="Profil de démonstration avec des limites lisibles pour la documentation.",
            is_default=False,
            is_system=False,
            is_active=True,
            maps_max=10,
            trips_total_max=25,
            storage_bytes_max=5 * 1024 * 1024 * 1024,
            photos_total_max=5000,
            places_per_map_max=2500,
            photos_per_place_max=20,
        )
        session.add(demo_quota)
        session.flush()
    for user in users.values():
        user.quota_profile_id = demo_quota.id

    # Keep several deterministic devices visible in Account > Security. The
    # real Playwright login adds the current session on top of these fixtures.
    for index, (agent, hours_ago) in enumerate([
        ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/138.0 Safari/537.36", 18),
        ("Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Chrome/138.0 Mobile Safari/537.36", 48),
        ("Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15", 96),
    ]):
        token = hashlib.sha256(f"cartavault-demo-session-{index}".encode()).hexdigest()
        csrf = hashlib.sha256(f"cartavault-demo-csrf-{index}".encode()).hexdigest()
        session.add(UserSession(
            id=stable_id("session", f"owner-{index}"), user_id=users["owner"].id,
            token_hash=token, csrf_token_hash=csrf,
            created_at=FIXED_NOW - timedelta(days=15 + index),
            last_used_at=FIXED_NOW - timedelta(hours=hours_ago),
            expires_at=FIXED_NOW + timedelta(days=365), user_agent=agent,
        ))

    encryption = CredentialEncryptionService.from_settings()
    user_key_specs = [
        ("google", "Google Main", "demo-google-key-not-valid-DF20", True, None),
        ("stadia", "Stadia Demo", "demo-stadia-key-not-valid-9A12", False, "PROVIDER_AUTH_FAILED"),
    ]
    for provider, name, secret, verified, error_code in user_key_specs:
        encrypted = encryption.encrypt(secret)
        session.add(UserApiCredential(
            id=stable_id("user-api-key", provider), user_id=users["owner"].id,
            provider=provider, name=name, encrypted_secret=encrypted.ciphertext,
            encryption_version=encrypted.version, secret_last4=secret[-4:],
            created_at=FIXED_NOW - timedelta(days=45), updated_at=FIXED_NOW,
            verified_at=FIXED_NOW - timedelta(days=40) if verified else None,
            last_used_at=FIXED_NOW - timedelta(days=2) if verified else None,
            last_error_code=error_code, last_error_status=401 if error_code else None,
            last_error_message="Clé fictive non transmise au fournisseur." if error_code else None,
            last_error_at=FIXED_NOW - timedelta(days=1) if error_code else None,
        ))
    for provider, name, secret in [
        ("google", "Google Routes — instance", "demo-admin-google-not-valid-7C31"),
        ("openrouteservice", "ORS — secours", "demo-admin-ors-not-valid-2E44"),
    ]:
        encrypted = encryption.encrypt(secret)
        session.add(AdminApiCredential(
            id=stable_id("admin-api-key", provider), provider=provider, name=name,
            encrypted_secret=encrypted.ciphertext, encryption_version=encrypted.version,
            secret_last4=secret[-4:], created_at=FIXED_NOW - timedelta(days=60),
            updated_at=FIXED_NOW, verified_at=FIXED_NOW - timedelta(days=55),
            last_used_at=FIXED_NOW - timedelta(days=3),
        ))

    maps: dict[str, PoiMap] = {}
    places_by_map: dict[str, list[Place]] = {}
    for map_slug, iso, display_name, center_lat, center_lon in [
        ("france", "FR", "Carnet de France", 46.6, 2.4),
        ("italy", "IT", "Grand tour d’Italie", 42.8, 12.5),
    ]:
        country = session.scalar(select(Country).where(Country.iso_alpha2 == iso))
        if country is None:
            raise RuntimeError(f"Country catalog is missing {iso}; migrations are incomplete.")
        poi_map = PoiMap(
            id=stable_id("map", map_slug), name=display_name, country_id=country.id, owner_id=users["owner"].id,
            is_private=True, center_latitude=center_lat, center_longitude=center_lon, default_zoom=6,
            created_at=FIXED_NOW - timedelta(days=90), updated_at=FIXED_NOW,
        )
        session.add(poi_map)
        session.flush()
        maps[map_slug] = poi_map
        for role in ("owner", "editor", "viewer"):
            session.add(MapMembership(
                id=stable_id("membership", f"{map_slug}-{role}"), map_id=poi_map.id,
                user_id=users[role].id, role=role, created_at=FIXED_NOW - timedelta(days=89), updated_at=FIXED_NOW,
            ))
        statuses = {}
        for order, (name, slug, state, color, default) in enumerate(STATUS_DEFS):
            status = PlaceStatus(
                id=stable_id("status", f"{map_slug}-{slug}"), map_id=poi_map.id, name=name, slug=slug,
                functional_state=state, color=color, sort_order=order, is_default=default, is_active=True,
                created_at=FIXED_NOW - timedelta(days=88), updated_at=FIXED_NOW,
            )
            session.add(status)
            statuses[slug] = status
        categories = {}
        for index, name in enumerate(CATEGORY_NAMES):
            category = Category(
                id=stable_id("category", f"{map_slug}-{name}"), map_id=poi_map.id, name=name,
                description="Catégorie de démonstration CartaVault.",
                icon=["building", "museum", "trees", "tools-kitchen-2", "binoculars"][index],
                marks_as_visited=False,
            )
            session.add(category)
            categories[name] = category
        tags = {}
        for name, color in [("Incontournable", "#0FA68A"), ("Photo", "#2563EB"), ("Famille", "#7C3AED")]:
            tag = Tag(id=stable_id("tag", f"{map_slug}-{name}"), map_id=poi_map.id, name=name, color=color)
            session.add(tag)
            tags[name] = tag
        session.flush()

        map_places = []
        for index, name in enumerate(PLACE_NAMES[map_slug]):
            region_index = index // 10
            region, base_lat, base_lon = REGIONS[map_slug][region_index]
            offset_row, offset_col = divmod(index % 10, 5)
            latitude = base_lat + (offset_row - 0.5) * 0.14 + (offset_col - 2) * 0.025
            longitude = base_lon + (offset_col - 2) * 0.12 + (offset_row - 0.5) * 0.03
            category_name = CATEGORY_NAMES[index % len(CATEGORY_NAMES)]
            status_slug = STATUS_DEFS[index % len(STATUS_DEFS)][1]
            place = Place(
                id=stable_id("place", f"{map_slug}-{index + 1}"), map_id=poi_map.id, status_id=statuses[status_slug].id,
                name=name, description=f"Lieu fictif conçu pour la démonstration CartaVault — {region}.",
                location=_point(longitude, latitude), region=region, country=country.name, country_code=iso,
                region_type="administrative", region_source="demo_fixture", region_resolved_at=FIXED_NOW,
                is_favorite=index % 7 == 0, interest_rating=((index % 10) + 1) / 2 if index % 3 else None,
                default_visit_duration_minutes=30 + (index % 4) * 15,
                custom_fields={"demo": "true", "source": "project-created", "fixture_id": f"{map_slug}-{index + 1:02d}"},
                created_at=FIXED_NOW - timedelta(days=70 - index), updated_at=FIXED_NOW - timedelta(days=index % 8),
            )
            session.add(place)
            session.flush()
            session.execute(place_categories_table.insert().values(place_id=place.id, category_id=categories[category_name].id, is_primary=True))
            place.tags.append(tags[["Incontournable", "Photo", "Famille"][index % 3]])
            place.links.append(PlaceLink(
                id=stable_id("link", f"{map_slug}-{index + 1}"), label="Fiche de démonstration",
                url=f"https://example.org/cartavault-demo/{map_slug}/{index + 1:02d}", sort_order=0,
            ))
            map_places.append(place)
        places_by_map[map_slug] = map_places

        template_specs = [
            ("Parking", "rectangle", "tabler:parking", "#0EA5E9"),
            ("Chemin d’accès", "path", "tabler:route", "#7C3AED"),
            ("Attention", "triangle", "tabler:alert-triangle", "#E11D48"),
            ("Important", "circle", "tabler:focus-2", "#F97316"),
        ]
        templates = []
        for sort_order, (name, shape, icon, color) in enumerate(template_specs):
            template = AnnotationTemplate(
                id=stable_id("annotation-template", f"{map_slug}-{shape}"), map_id=poi_map.id,
                name=name, shape_type=shape, icon=icon, color=color, sort_order=sort_order,
                is_active=True, created_at=FIXED_NOW - timedelta(days=50), updated_at=FIXED_NOW,
            )
            session.add(template)
            templates.append(template)
        session.flush()
        for index, template in enumerate(templates):
            anchor = map_places[index]
            point = REGIONS[map_slug][0]
            latitude = point[1] + index * 0.01
            longitude = point[2] + index * 0.01
            geometry = (
                {"type": "Point", "coordinates": [longitude, latitude]}
                if template.shape_type == "circle" else
                {"type": "LineString", "coordinates": [[longitude, latitude], [longitude + 0.015, latitude + 0.01]]}
                if template.shape_type in {"line", "path"} else
                {"type": "Polygon", "coordinates": [[[longitude, latitude], [longitude + 0.01, latitude], [longitude + 0.01, latitude + 0.01], [longitude, latitude + 0.01], [longitude, latitude]]]}
            )
            session.add(PlaceAnnotation(
                id=stable_id("annotation", f"{map_slug}-{index}"), place_id=anchor.id,
                template_id=template.id, geometry=geometry,
                radius_meters=250.0 if template.shape_type == "circle" else None,
                title=f"{template.name} — démonstration", description="Annotation fictive destinée aux captures de documentation.",
                created_at=FIXED_NOW - timedelta(days=20), updated_at=FIXED_NOW,
            ))

    session.flush()
    create_project_media(session, places_by_map, users["owner"].id)

    # Keep one harmless, unused POI in the trash so the restoration workflow
    # is documented with a real item instead of an unrelated empty state.
    trashed_place = places_by_map["italy"][-1]
    trashed_place.deleted_at = FIXED_NOW + timedelta(days=50)
    trashed_place.purge_after = FIXED_NOW + timedelta(days=365)
    trashed_place.deleted_by_user_id = users["owner"].id

    trip_specs = [
        ("italy-main", "italy", "Grand tour responsable", 5, date(2026, 9, 7), "planned"),
        ("france-short", "france", "Escapade culturelle", 2, date(2026, 10, 3), "planned"),
        ("france-draft", "france", "Idées pour le printemps", 1, None, "draft"),
    ]
    for trip_slug, map_slug, title, day_count, start_date, status in trip_specs:
        trip = Trip(
            id=stable_id("trip", trip_slug), map_id=maps[map_slug].id, created_by_user_id=users["owner"].id,
            name=title, description="Sortie déterministe de démonstration CartaVault.", start_date=start_date,
            end_date=start_date + timedelta(days=day_count - 1) if start_date else None, status=status,
            created_at=FIXED_NOW - timedelta(days=30), updated_at=FIXED_NOW,
        )
        session.add(trip)
        session.flush()
        trip_places = places_by_map[map_slug]
        days = []
        for day_index in range(day_count):
            selected = trip_places[day_index * 5:day_index * 5 + 5]
            coordinates = []
            for item in selected:
                # The demo points were produced from these same deterministic coordinates.
                point_index = trip_places.index(item)
                region_index = point_index // 10
                _, base_lat, base_lon = REGIONS[map_slug][region_index]
                row, col = divmod(point_index % 10, 5)
                coordinates.append((base_lat + (row - .5) * .14 + (col - 2) * .025, base_lon + (col - 2) * .12 + (row - .5) * .03))
            # A day after the first one starts at the preceding night. Keep that
            # transition in the fixture geometry so the preview never renders
            # disconnected daily routes.
            route_coordinates = coordinates
            if day_index > 0:
                previous_night_index = day_index * 5 - 1
                _, night_base_lat, night_base_lon = REGIONS[map_slug][previous_night_index // 10]
                night_row, night_col = divmod(previous_night_index % 10, 5)
                previous_night_coordinates = (
                    night_base_lat + (night_row - .5) * .14 + (night_col - 2) * .025,
                    night_base_lon + (night_col - 2) * .12 + (night_row - .5) * .03,
                )
                route_coordinates = [previous_night_coordinates, *coordinates]
            route_fixture = ROUTE_FIXTURES.get(f"{trip_slug}-{day_index + 1}")
            distance = route_fixture["distance_meters"] if route_fixture else 18000.0 + day_index * 7250.0
            duration = route_fixture["duration_seconds"] if route_fixture else 2700.0 + day_index * 900.0
            route_geometry = (
                {"type": "LineString", "coordinates": route_fixture["coordinates"]}
                if route_fixture else _route(route_coordinates)
            )
            day = TripDay(
                id=stable_id("day", f"{trip_slug}-{day_index + 1}"), trip_id=trip.id,
                day_number=day_index + 1, sort_order=day_index,
                date=start_date + timedelta(days=day_index) if start_date else None,
                title=f"Journée {day_index + 1}", color=DAY_COLORS[day_index], planned_start_time=time(9, 0),
                planned_end_time=time(18, 0), route_distance_meters=distance, route_duration_seconds=duration,
                visit_duration_minutes=sum(p.default_visit_duration_minutes or 30 for p in selected),
                total_duration_minutes=int(duration / 60) + sum(p.default_visit_duration_minutes or 30 for p in selected),
                route_geometry=route_geometry, route_segments=[], route_status="ready", route_provider="osrm",
                created_at=FIXED_NOW - timedelta(days=29), updated_at=FIXED_NOW,
            )
            session.add(day)
            session.flush()
            days.append(day)
            for stop_index, (place, (lat, lon)) in enumerate(zip(selected, coordinates, strict=True)):
                session.add(TripStop(
                    id=stable_id("stop", f"{trip_slug}-{day_index + 1}-{stop_index + 1}"), trip_day_id=day.id,
                    place_id=place.id, stop_type="place", name=place.name, latitude=lat, longitude=lon,
                    address=f"{region if (region := place.region) else ''}", sort_order=stop_index,
                    visit_duration_minutes=place.default_visit_duration_minutes, visit_status="planned",
                    created_at=FIXED_NOW - timedelta(days=29), updated_at=FIXED_NOW,
                ))
        first = trip_places[0]
        last = trip_places[min(day_count * 5 - 1, len(trip_places) - 1)]
        first_region = REGIONS[map_slug][0]
        last_index = min(day_count * 5 - 1, len(trip_places) - 1)
        last_region = REGIONS[map_slug][last_index // 10]
        session.add(TripDeparture(
            id=stable_id("departure", trip_slug), trip_id=trip.id, place_id=first.id, name=first.name,
            latitude=first_region[1] - .07 - .05, longitude=first_region[2] - .24 - .015,
            address=first.region, departure_time=time(8, 30), created_at=FIXED_NOW, updated_at=FIXED_NOW,
        ))
        session.add(TripArrival(
            id=stable_id("arrival", trip_slug), trip_id=trip.id, place_id=last.id, name=last.name,
            latitude=last_region[1] + ((last_index % 10) // 5 - .5) * .14 + ((last_index % 10) % 5 - 2) * .025,
            longitude=last_region[2] + ((last_index % 10) % 5 - 2) * .12 + ((last_index % 10) // 5 - .5) * .03,
            address=last.region, created_at=FIXED_NOW, updated_at=FIXED_NOW,
        ))
        for night_index in range(max(0, day_count - 1)):
            hotel = trip_places[(night_index + 1) * 5 - 1]
            point_index = (night_index + 1) * 5 - 1
            reg = REGIONS[map_slug][point_index // 10]
            row, col = divmod(point_index % 10, 5)
            session.add(TripNight(
                id=stable_id("night", f"{trip_slug}-{night_index + 1}"), trip_id=trip.id,
                previous_day_id=days[night_index].id, next_day_id=days[night_index + 1].id,
                place_id=hotel.id, source_type="place", name=f"Maison d’hôtes — Nuit {night_index + 1}",
                latitude=reg[1] + (row - .5) * .14 + (col - 2) * .025,
                longitude=reg[2] + (col - 2) * .12 + (row - .5) * .03,
                address=hotel.region, description="Hébergement fictif pour la démonstration.",
                check_in_from_time=time(16), check_in_until_time=time(22), check_out_from_time=time(7), check_out_until_time=time(10),
                created_at=FIXED_NOW, updated_at=FIXED_NOW,
            ))

    session.commit()
    return {"users": users, "maps": maps, "places": places_by_map}


def validate(session) -> dict[str, object]:
    import app.models  # noqa: F401
    from app.annotations.models import AnnotationTemplate, PlaceAnnotation
    from app.auth.models import AdminApiCredential, User, UserApiCredential, UserSession
    from app.maps.models import MapMembership, PoiMap
    from app.places.models import Place
    from app.photos.models import Photo
    from app.trips.models import Trip, TripDay, TripNight, TripStop

    counts = {
        "users": session.scalar(select(func.count()).select_from(User)),
        "maps": session.scalar(select(func.count()).select_from(PoiMap)),
        "memberships": session.scalar(select(func.count()).select_from(MapMembership)),
        "places": session.scalar(select(func.count()).select_from(Place)),
        "photos": session.scalar(select(func.count()).select_from(Photo)),
        "trips": session.scalar(select(func.count()).select_from(Trip)),
        "trip_days": session.scalar(select(func.count()).select_from(TripDay)),
        "trip_stops": session.scalar(select(func.count()).select_from(TripStop)),
        "trip_nights": session.scalar(select(func.count()).select_from(TripNight)),
        "annotation_templates": session.scalar(select(func.count()).select_from(AnnotationTemplate)),
        "annotations": session.scalar(select(func.count()).select_from(PlaceAnnotation)),
        "seed_sessions": session.scalar(select(func.count()).select_from(UserSession)),
        "user_api_keys": session.scalar(select(func.count()).select_from(UserApiCredential)),
        "admin_api_keys": session.scalar(select(func.count()).select_from(AdminApiCredential)),
    }
    expected = {"users": 3, "maps": 2, "memberships": 6, "places": 60, "photos": 31, "trips": 3, "trip_days": 8, "trip_stops": 40, "trip_nights": 5, "annotation_templates": 8, "annotations": 8, "seed_sessions": 3, "user_api_keys": 2, "admin_api_keys": 2}
    errors = [f"{key}: expected {expected[key]}, got {counts[key]}" for key in expected if counts[key] != expected[key]]
    region_counts = dict(session.execute(select(Place.region, func.count()).group_by(Place.region)).all())
    if len(region_counts) != 6 or any(value != 10 for value in region_counts.values()):
        errors.append(f"regions: expected six groups of ten, got {region_counts}")
    fixture_ids = session.scalars(select(Place.custom_fields["fixture_id"].as_string())).all()
    if len(set(fixture_ids)) != 60:
        errors.append("fixture identifiers are not unique")
    result = {"valid": not errors, "counts": counts, "regions": region_counts, "errors": errors, "reference_time": FIXED_NOW.isoformat()}
    if errors:
        raise RuntimeError(json.dumps(result, ensure_ascii=False, indent=2))
    return result


def reset() -> dict[str, object]:
    ensure_demo_target()
    # Preflight immutable source assets before the destructive database reset.
    # Only runtime copies under PHOTO_STORAGE_PATH are ever written here.
    validate_project_media_assets()
    run_migrations()
    from app.database import SessionLocal
    with SessionLocal() as session:
        clear_application_data(session)
        seed(session)
        return validate(session)


def validate_only() -> dict[str, object]:
    ensure_demo_target()
    from app.database import SessionLocal
    with SessionLocal() as session:
        return validate(session)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=("reset", "validate"))
    args = parser.parse_args()
    try:
        result = reset() if args.command == "reset" else validate_only()
    except Exception as error:
        print(f"demo {args.command} failed: {error}", file=sys.stderr)
        return 1
    print(json.dumps(result, ensure_ascii=False, indent=2, default=str))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
