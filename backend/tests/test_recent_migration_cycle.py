import pytest


pytestmark = pytest.mark.integration

PARENT_REVISION = "c2e5a8b1d940"
METERING_REVISION = "d3f6b9c2e851"


def test_latest_migration_upgrade_downgrade_upgrade_cycle(migration_environment) -> None:
    migration_environment.upgrade(PARENT_REVISION)
    assert migration_environment.current_heads() == {PARENT_REVISION}

    migration_environment.upgrade(METERING_REVISION)
    assert migration_environment.current_heads() == {METERING_REVISION}

    migration_environment.downgrade(PARENT_REVISION)
    assert migration_environment.current_heads() == {PARENT_REVISION}

    migration_environment.upgrade("heads")
    migration_environment.assert_at_head()
