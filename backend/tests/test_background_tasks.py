from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest

from app.auth.models import User
from app.tasks.models import BackgroundTask


pytestmark = pytest.mark.integration


def test_task_history_is_owner_scoped_and_pending_tasks_can_be_cancelled(
    integration_client, database_session, auth_user, poi_map,
) -> None:
    owned = BackgroundTask(
        task_type="test_task",
        requested_by_user_id=auth_user.id,
        map_id=poi_map.id,
        status="pending",
        progress_current=0,
        progress_total=4,
        progress_message="En attente",
        input_json={},
        expires_at=datetime.now(UTC) + timedelta(hours=1),
    )
    stranger = User(
        email=f"worker-{uuid4()}@example.test",
        display_name="Other user",
        password_hash="test-only",
        is_active=True,
    )
    database_session.add_all([owned, stranger])
    database_session.flush()
    hidden = BackgroundTask(
        task_type="test_task",
        requested_by_user_id=stranger.id,
        status="failed",
        progress_current=0,
        progress_total=1,
        progress_message="Interrompu",
        input_json={},
        expires_at=datetime.now(UTC) + timedelta(hours=1),
    )
    database_session.add(hidden)
    database_session.commit()

    history = integration_client.get("/tasks")
    assert history.status_code == 200
    assert [item["id"] for item in history.json()] == [str(owned.id)]
    assert integration_client.get(f"/tasks/{hidden.id}").status_code == 404

    cancelled = integration_client.delete(f"/tasks/{owned.id}")
    assert cancelled.status_code == 200
    assert cancelled.json()["status"] == "cancelled"
    assert cancelled.json()["finished_at"] is not None
