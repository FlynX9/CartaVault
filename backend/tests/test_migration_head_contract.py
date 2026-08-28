from alembic import command
from alembic.script import ScriptDirectory

import pytest


pytestmark = pytest.mark.integration

MERGE_REVISION = "ff6c2b8d3e01"
FORMER_HEADS = {"a6c9e3f1b742", "fe5b1a7c2d90"}


def test_migration_graph_has_one_head(migration_environment) -> None:
    assert ScriptDirectory.from_config(migration_environment.config).get_heads() == [MERGE_REVISION]


@pytest.mark.parametrize("starting_revision", [None, *sorted(FORMER_HEADS)])
def test_upgrade_head_reaches_merge_from_supported_starting_revisions(
    migration_environment, starting_revision
) -> None:
    if starting_revision is not None:
        migration_environment.upgrade(starting_revision)

    migration_environment.upgrade("head")

    assert migration_environment.current_heads() == {MERGE_REVISION}


def test_upgrade_head_from_both_former_heads_applies_only_merge(migration_environment) -> None:
    migration_environment.upgrade("head")
    command.stamp(migration_environment.config, sorted(FORMER_HEADS), purge=True)
    assert migration_environment.current_heads() == FORMER_HEADS

    migration_environment.upgrade("head")

    assert migration_environment.current_heads() == {MERGE_REVISION}


def test_alembic_check_passes_at_head(migration_environment) -> None:
    migration_environment.upgrade("head")

    command.check(migration_environment.config)
