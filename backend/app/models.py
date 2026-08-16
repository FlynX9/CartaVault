"""Register every SQLAlchemy model and association on the shared metadata.

Import this module before issuing ORM queries from entry points that do not
load the FastAPI routers, notably the administration CLI and Alembic.
"""

from app.auth.models import AdminApiCredential, AuthActionToken, AuthSecurityEvent, RegistrationRequest, SystemCredential, User, UserApiCredential, UserSession
from app.admin.models import SystemSetting
from app.instance_status.models import InstanceLog
from app.annotations.models import AnnotationTemplate, PlaceAnnotation
from app.quotas.models import QuotaProfile
from app.categories.associations import place_categories_table
from app.categories.models import Category
from app.countries.models import Country
from app.maps.models import MapInvitation, MapMembership, PoiMap
from app.photos.models import Photo
from app.places.models import Place, PlaceHistory, PlaceLink
from app.statuses.models import PlaceStatus
from app.tags.associations import place_tags_table
from app.tags.models import Tag
from app.trips.models import RoutingOptimizationProposal, Trip, TripDay, TripDeparture, TripNight, TripStop
from app.tasks.models import BackgroundTask, GeneratedExport, KmzImportPreview
from app.basemaps.vector_models import VectorBasemap

__all__ = (
    "Category",
    "AnnotationTemplate",
    "PlaceAnnotation",
    "Country",
    "MapInvitation",
    "MapMembership",
    "Photo",
    "Place",
    "PlaceHistory",
    "PlaceLink",
    "PlaceStatus",
    "PoiMap",
    "Tag",
    "User",
    "AuthActionToken",
    "AuthSecurityEvent",
    "RegistrationRequest",
    "SystemCredential",
    "AdminApiCredential",
    "SystemSetting",
    "InstanceLog",
    "QuotaProfile",
    "UserApiCredential",
    "UserSession",
    "Trip",
    "RoutingOptimizationProposal",
    "TripDay",
    "TripDeparture",
    "TripStop",
    "TripNight",
    "BackgroundTask",
    "GeneratedExport",
    "KmzImportPreview",
    "VectorBasemap",
    "place_categories_table",
    "place_tags_table",
)
