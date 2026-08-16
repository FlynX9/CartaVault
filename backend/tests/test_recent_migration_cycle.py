import pytest
from sqlalchemy import text


pytestmark = pytest.mark.integration

PARENT_REVISION = "d3f6b9c2e851"
PROGRESS_BIGINT_REVISION = "e4a7c1d9b620"


def test_latest_migration_upgrade_downgrade_upgrade_cycle(migration_environment) -> None:
    migration_environment.upgrade(PARENT_REVISION)
    assert migration_environment.current_heads() == {PARENT_REVISION}

    migration_environment.upgrade(PROGRESS_BIGINT_REVISION)
    assert migration_environment.current_heads() == {PROGRESS_BIGINT_REVISION}

    with migration_environment.engine.begin() as connection:
        types = dict(connection.execute(text(
            "SELECT column_name, data_type FROM information_schema.columns "
            "WHERE table_schema = current_schema() AND table_name = 'background_tasks' "
            "AND column_name IN ('progress_current', 'progress_total')"
        )).all())
        assert types == {"progress_current": "bigint", "progress_total": "bigint"}
        user_id = connection.scalar(text(
            "INSERT INTO users (email, display_name, password_hash, is_active) "
            "VALUES ('large-progress@example.test', 'Large progress', 'test-only', true) RETURNING id"
        ))
        stored = connection.scalar(text(
            "INSERT INTO background_tasks "
            "(task_type, requested_by_user_id, progress_total, expires_at) "
            "VALUES ('large_download', :user_id, 5061953195, now() + interval '1 hour') "
            "RETURNING progress_total"
        ), {"user_id": user_id})
        assert stored == 5_061_953_195

    migration_environment.downgrade(PARENT_REVISION)
    assert migration_environment.current_heads() == {PARENT_REVISION}

    migration_environment.upgrade("heads")
    migration_environment.assert_at_head()
