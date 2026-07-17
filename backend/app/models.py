"""Register every SQLAlchemy model and association on the shared metadata.

Import this module before issuing ORM queries from entry points that do not
load the FastAPI routers, notably the administration CLI and Alembic.
"""

from app.auth.models import User, UserSession
from app.categories.associations import place_categories_table
from app.categories.models import Category
from app.countries.models import Country
from app.maps.models import MapInvitation, MapMembership, PoiMap
from app.photos.models import Photo
from app.places.models import Place
from app.statuses.models import PlaceStatus
from app.tags.associations import place_tags_table
from app.tags.models import Tag
from app.trips.models import Trip, TripDay, TripDeparture, TripNight, TripStop

__all__ = (
    "Category",
    "Country",
    "MapInvitation",
    "MapMembership",
    "Photo",
    "Place",
    "PlaceStatus",
    "PoiMap",
    "Tag",
    "User",
    "UserSession",
    "Trip",
    "TripDay",
    "TripDeparture",
    "TripStop",
    "TripNight",
    "place_categories_table",
    "place_tags_table",
)
