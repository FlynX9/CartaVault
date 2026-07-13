import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import inspect, text


pytestmark = pytest.mark.integration

MIGRATION_MAP_ID = "20000000-0000-4000-8000-000000000001"
MIGRATION_PLACE_ID = "30000000-0000-4000-8000-000000000001"


def test_status_migration_downgrade_upgrade_cycle(
    test_engine,
    test_database_url,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Exercise the destructive cycle only on the validated test database."""

    monkeypatch.setenv("DATABASE_URL", test_database_url.render_as_string(hide_password=False))
    config = Config("alembic.ini")

    with test_engine.begin() as connection:
        country_id = connection.scalar(text("SELECT c.id FROM countries c WHERE NOT EXISTS (SELECT 1 FROM poi_maps m WHERE m.country_id = c.id) ORDER BY c.id LIMIT 1"))
        default_status_id = connection.scalar(
            text("SELECT id FROM place_statuses WHERE is_default")
        )
        connection.execute(text("DELETE FROM places WHERE id = :id"), {"id": MIGRATION_PLACE_ID})
        connection.execute(text("DELETE FROM poi_maps WHERE id = :id"), {"id": MIGRATION_MAP_ID})
        connection.execute(
            text("INSERT INTO poi_maps (id, name, country_id) VALUES (:id, 'Migration test', :country_id)"),
            {"id": MIGRATION_MAP_ID, "country_id": country_id},
        )
        connection.execute(
            text("INSERT INTO places (id, name, map_id, status_id) VALUES (:id, 'Migration test', :map_id, :status_id)"),
            {"id": MIGRATION_PLACE_ID, "map_id": MIGRATION_MAP_ID, "status_id": default_status_id},
        )

    # create_all prepared the current model schema; stamp it before testing the
    # reversible migration itself. No development database can reach here.
    command.stamp(config, "head")
    command.downgrade(config, "6f2d8a4c91b0")
    assert "place_statuses" not in inspect(test_engine).get_table_names()
    assert "status_id" not in {
        column["name"] for column in inspect(test_engine).get_columns("places")
    }

    command.upgrade(config, "head")
    assert "place_statuses" in inspect(test_engine).get_table_names()
    with test_engine.connect() as connection:
        assert connection.scalar(text("SELECT count(*) FROM place_statuses")) == 5
        assert connection.scalar(text("SELECT count(*) FROM places WHERE status_id IS NULL")) == 0
        assert connection.scalar(
            text("SELECT ps.is_default FROM places p JOIN place_statuses ps ON ps.id = p.status_id WHERE p.id = :id"),
            {"id": MIGRATION_PLACE_ID},
        ) is True
    with test_engine.begin() as connection:
        connection.execute(text("DELETE FROM places WHERE id = :id"), {"id": MIGRATION_PLACE_ID})
        connection.execute(text("DELETE FROM poi_maps WHERE id = :id"), {"id": MIGRATION_MAP_ID})
