from __future__ import annotations

import pytest
from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.auth.models import User
from app.basemaps.vector_service import authorize_vector_basemap_request
from app.media.optimization import _require_current_admin
from app.maps.models import MapMembership, PoiMap
from app.tasks.handlers import _current_map_editor


pytestmark = pytest.mark.integration


def test_vector_preparation_requires_same_country_editor_or_admin(
    database_session: Session,
    auth_user: User,
    poi_map: PoiMap,
) -> None:
    # The fixture administrator can administer any supported country.
    authorize_vector_basemap_request(database_session, "MC", auth_user.id, "manual_install")

    auth_user.is_admin = False
    database_session.commit()
    # The owner can lazily prepare the basemap for the country of their map.
    authorize_vector_basemap_request(database_session, "FR", auth_user.id, "offline_use")

    with pytest.raises(HTTPException) as unrelated:
        authorize_vector_basemap_request(database_session, "MC", auth_user.id, "offline_use")
    assert unrelated.value.status_code == 403

    membership = database_session.query(MapMembership).filter_by(
        map_id=poi_map.id, user_id=auth_user.id
    ).one()
    membership.role = "viewer"
    database_session.commit()
    with pytest.raises(HTTPException) as revoked:
        authorize_vector_basemap_request(database_session, "FR", auth_user.id, "offline_use")
    assert revoked.value.status_code == 403

    auth_user.is_active = False
    database_session.commit()
    with pytest.raises(HTTPException) as deactivated:
        authorize_vector_basemap_request(database_session, "FR", auth_user.id, "offline_use")
    assert deactivated.value.status_code == 403


def test_media_optimization_reloads_active_admin_authority(
    database_session: Session,
    auth_user: User,
) -> None:
    _require_current_admin(database_session, auth_user.id)

    auth_user.is_admin = False
    database_session.commit()
    with pytest.raises(HTTPException) as demoted:
        _require_current_admin(database_session, auth_user.id)
    assert demoted.value.status_code == 403

    auth_user.is_admin = True
    auth_user.is_active = False
    database_session.commit()
    with pytest.raises(HTTPException) as deactivated:
        _require_current_admin(database_session, auth_user.id)
    assert deactivated.value.status_code == 403


def test_kmz_final_authority_check_requires_current_map_editor(
    database_session: Session,
    auth_user: User,
    poi_map: PoiMap,
) -> None:
    _current_map_editor(database_session, poi_map.id, auth_user.id)

    membership = database_session.query(MapMembership).filter_by(
        map_id=poi_map.id, user_id=auth_user.id
    ).one()
    membership.role = "viewer"
    database_session.commit()
    with pytest.raises(HTTPException) as revoked:
        _current_map_editor(database_session, poi_map.id, auth_user.id, lock=True)
    assert revoked.value.status_code == 403

    membership.role = "owner"
    auth_user.is_active = False
    database_session.commit()
    with pytest.raises(HTTPException) as deactivated:
        _current_map_editor(database_session, poi_map.id, auth_user.id, lock=True)
    assert deactivated.value.status_code == 403
