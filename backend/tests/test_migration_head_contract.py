from alembic import command
from alembic.script import ScriptDirectory
from sqlalchemy import text

import pytest


pytestmark = pytest.mark.integration

CURRENT_HEAD = "e1a4c7d9f203"
MERGE_REVISION = "ff6c2b8d3e01"
FORMER_HEADS = {"a6c9e3f1b742", "fe5b1a7c2d90"}


def test_migration_graph_has_one_head(migration_environment) -> None:
    assert ScriptDirectory.from_config(migration_environment.config).get_heads() == [CURRENT_HEAD]


@pytest.mark.parametrize("starting_revision", [None, *sorted(FORMER_HEADS), MERGE_REVISION])
def test_upgrade_head_reaches_current_from_supported_starting_revisions(
    migration_environment, starting_revision
) -> None:
    if starting_revision is not None:
        migration_environment.upgrade(starting_revision)

    migration_environment.upgrade("head")

    assert migration_environment.current_heads() == {CURRENT_HEAD}


def test_recovery_lease_columns_added_from_previous_head(migration_environment) -> None:
    """Upgrade from the previous head adds nullable lease columns without
    invalidating existing rows, and downgrade removes them cleanly."""

    migration_environment.upgrade(MERGE_REVISION)
    assert migration_environment.current_heads() == {MERGE_REVISION}

    with migration_environment.engine.begin() as connection:
        user_id = connection.execute(text(
            "INSERT INTO users (email, display_name, password_hash, is_active) "
            "VALUES ('lease-migration@example.test', 'Lease migration', 'test-only', true) RETURNING id"
        )).scalar()
        connection.execute(text(
            "INSERT INTO background_tasks (task_type, requested_by_user_id, expires_at) "
            "VALUES ('migration_probe', :user_id, now() + interval '1 hour')"
        ), {"user_id": user_id})

    migration_environment.upgrade("head")
    assert migration_environment.current_heads() == {CURRENT_HEAD}

    with migration_environment.engine.begin() as connection:
        columns = {row[0] for row in connection.execute(text(
            "SELECT column_name FROM information_schema.columns "
            "WHERE table_schema = current_schema() AND table_name = 'background_tasks' "
            "AND column_name IN ('lease_owner', 'lease_token', 'lease_expires_at')"
        ))}
        assert columns == {"lease_owner", "lease_token", "lease_expires_at"}
        # The pre-existing row survives the upgrade with a NULL (unowned) lease.
        lease = connection.execute(text(
            "SELECT lease_owner, lease_token, lease_expires_at FROM background_tasks WHERE task_type = 'migration_probe'"
        )).first()
        assert lease == (None, None, None)

    migration_environment.downgrade(MERGE_REVISION)
    assert migration_environment.current_heads() == {MERGE_REVISION}

    with migration_environment.engine.begin() as connection:
        columns = {row[0] for row in connection.execute(text(
            "SELECT column_name FROM information_schema.columns "
            "WHERE table_schema = current_schema() AND table_name = 'background_tasks' "
            "AND column_name IN ('lease_owner', 'lease_token', 'lease_expires_at')"
        ))}
        assert columns == set()

    migration_environment.upgrade("heads")
    migration_environment.assert_at_head()


def test_alembic_check_passes_at_head(migration_environment) -> None:
    migration_environment.upgrade("head")

    command.check(migration_environment.config)
