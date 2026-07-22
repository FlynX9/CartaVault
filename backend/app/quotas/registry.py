from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum


class QuotaScope(StrEnum):
    USER = "user"
    MAP = "map"
    PLACE = "place"
    TRIP = "trip"
    DAY = "day"


class QuotaKey(StrEnum):
    MAPS_MAX = "maps_max"
    TRIPS_TOTAL_MAX = "trips_total_max"
    STORAGE_BYTES_MAX = "storage_bytes_max"
    PHOTOS_TOTAL_MAX = "photos_total_max"
    MEMBERSHIPS_TOTAL_MAX = "memberships_total_max"
    PENDING_INVITATIONS_MAX = "pending_invitations_max"
    PLACES_PER_MAP_MAX = "places_per_map_max"
    TAGS_PER_MAP_MAX = "tags_per_map_max"
    CATEGORIES_PER_MAP_MAX = "categories_per_map_max"
    STATUSES_PER_MAP_MAX = "statuses_per_map_max"
    TRIPS_PER_MAP_MAX = "trips_per_map_max"
    MEMBERS_PER_MAP_MAX = "members_per_map_max"
    PENDING_INVITATIONS_PER_MAP_MAX = "pending_invitations_per_map_max"
    PHOTOS_PER_PLACE_MAX = "photos_per_place_max"
    LINKS_PER_PLACE_MAX = "links_per_place_max"
    DAYS_PER_TRIP_MAX = "days_per_trip_max"
    STEPS_PER_DAY_MAX = "steps_per_day_max"


@dataclass(frozen=True)
class QuotaDefinition:
    key: QuotaKey
    scope: QuotaScope
    unit: str
    label: str
    description: str
    maximum: int
    enforced: bool = True


def _definition(key: QuotaKey, scope: QuotaScope, label: str, description: str, *, unit: str = "count", maximum: int = 2_147_483_647) -> QuotaDefinition:
    return QuotaDefinition(key, scope, unit, label, description, maximum)


QUOTA_REGISTRY: dict[QuotaKey, QuotaDefinition] = {
    QuotaKey.MAPS_MAX: _definition(QuotaKey.MAPS_MAX, QuotaScope.USER, "Cartes", "Nombre de cartes possédées"),
    QuotaKey.TRIPS_TOTAL_MAX: _definition(QuotaKey.TRIPS_TOTAL_MAX, QuotaScope.USER, "Sorties", "Nombre total de sorties"),
    QuotaKey.STORAGE_BYTES_MAX: _definition(QuotaKey.STORAGE_BYTES_MAX, QuotaScope.USER, "Stockage", "Volume total des médias", unit="bytes", maximum=9_223_372_036_854_775_807),
    QuotaKey.PHOTOS_TOTAL_MAX: _definition(QuotaKey.PHOTOS_TOTAL_MAX, QuotaScope.USER, "Photos", "Nombre total de photos"),
    QuotaKey.MEMBERSHIPS_TOTAL_MAX: _definition(QuotaKey.MEMBERSHIPS_TOTAL_MAX, QuotaScope.USER, "Participations", "Nombre total de cartes partagées"),
    QuotaKey.PENDING_INVITATIONS_MAX: _definition(QuotaKey.PENDING_INVITATIONS_MAX, QuotaScope.USER, "Invitations en attente", "Nombre total d'invitations actives"),
    QuotaKey.PLACES_PER_MAP_MAX: _definition(QuotaKey.PLACES_PER_MAP_MAX, QuotaScope.MAP, "Lieux par carte", "Lieux actifs et placés dans la corbeille"),
    QuotaKey.TAGS_PER_MAP_MAX: _definition(QuotaKey.TAGS_PER_MAP_MAX, QuotaScope.MAP, "Tags par carte", "Tags disponibles sur une carte"),
    QuotaKey.CATEGORIES_PER_MAP_MAX: _definition(QuotaKey.CATEGORIES_PER_MAP_MAX, QuotaScope.MAP, "Catégories par carte", "Catégories disponibles sur une carte"),
    QuotaKey.STATUSES_PER_MAP_MAX: _definition(QuotaKey.STATUSES_PER_MAP_MAX, QuotaScope.MAP, "Statuts par carte", "Statuts disponibles sur une carte"),
    QuotaKey.TRIPS_PER_MAP_MAX: _definition(QuotaKey.TRIPS_PER_MAP_MAX, QuotaScope.MAP, "Sorties par carte", "Sorties actives ou archivées sur une carte"),
    QuotaKey.MEMBERS_PER_MAP_MAX: _definition(QuotaKey.MEMBERS_PER_MAP_MAX, QuotaScope.MAP, "Membres par carte", "Propriétaire et membres actifs"),
    QuotaKey.PENDING_INVITATIONS_PER_MAP_MAX: _definition(QuotaKey.PENDING_INVITATIONS_PER_MAP_MAX, QuotaScope.MAP, "Invitations par carte", "Invitations actives en attente"),
    QuotaKey.PHOTOS_PER_PLACE_MAX: _definition(QuotaKey.PHOTOS_PER_PLACE_MAX, QuotaScope.PLACE, "Photos par lieu", "Photos associées à un lieu"),
    QuotaKey.LINKS_PER_PLACE_MAX: _definition(QuotaKey.LINKS_PER_PLACE_MAX, QuotaScope.PLACE, "Liens par lieu", "Liens associés à un lieu"),
    QuotaKey.DAYS_PER_TRIP_MAX: _definition(QuotaKey.DAYS_PER_TRIP_MAX, QuotaScope.TRIP, "Journées par sortie", "Journées planifiées dans une sortie"),
    QuotaKey.STEPS_PER_DAY_MAX: _definition(QuotaKey.STEPS_PER_DAY_MAX, QuotaScope.DAY, "Étapes par journée", "Étapes planifiées dans une journée"),
}

QUOTA_KEYS = tuple(definition.key.value for definition in QUOTA_REGISTRY.values())

