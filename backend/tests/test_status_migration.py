import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import inspect, text


pytestmark = pytest.mark.integration

MIGRATION_MAP_ID = "20000000-0000-4000-8000-000000000001"
MIGRATION_PLACE_ID = "30000000-0000-4000-8000-000000000001"
MIGRATION_STATUS_ID = "10000000-0000-4000-8000-000000000099"
MIGRATION_STATUS_ROWS = (
    (MIGRATION_STATUS_ID, "À faire", "a-faire", True),
    ("10000000-0000-4000-8000-000000000098", "Fait", "fait", False),
    ("10000000-0000-4000-8000-000000000097", "À vérifier", "a-verifier", False),
    ("10000000-0000-4000-8000-000000000096", "À refaire", "a-refaire", False),
    ("10000000-0000-4000-8000-000000000095", "Inaccessible", "inaccessible", False),
    ("10000000-0000-4000-8000-000000000094", "Personnalisé", "personnalise", False),
)
PREVIOUS_REVISION = "a4f9c2e7d631"
MIGRATION_REVISION = "d6f1a3b8c902"


def test_status_migration_downgrade_upgrade_cycle(
    test_engine,
    test_database_url,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Exercise the destructive cycle only on the validated test database."""

    monkeypatch.setenv("DATABASE_URL", test_database_url.render_as_string(hide_password=False))
    config = Config("alembic.ini")

    with test_engine.begin() as connection:
        owner_id = connection.scalar(text("INSERT INTO users (email, display_name, password_hash, is_admin, is_active) VALUES ('status-cycle@example.test', 'Status cycle', 'test-only-hash', true, true) ON CONFLICT (email) DO UPDATE SET is_admin=true, is_active=true RETURNING id"))
        country_id = connection.scalar(text("SELECT c.id FROM countries c WHERE NOT EXISTS (SELECT 1 FROM poi_maps m WHERE m.country_id = c.id) ORDER BY c.id LIMIT 1"))
        connection.execute(text("DELETE FROM places WHERE id = :id"), {"id": MIGRATION_PLACE_ID})
        connection.execute(text("DELETE FROM poi_maps WHERE id = :id"), {"id": MIGRATION_MAP_ID})
        connection.execute(
            text("INSERT INTO poi_maps (id, name, country_id, owner_id, is_private) VALUES (:id, 'Migration test', :country_id, :owner_id, true)"),
            {"id": MIGRATION_MAP_ID, "country_id": country_id, "owner_id": owner_id},
        )
        connection.execute(text("INSERT INTO map_memberships (map_id, user_id, role) VALUES (:map_id, :owner_id, 'owner')"), {"map_id": MIGRATION_MAP_ID, "owner_id": owner_id})
        connection.execute(
            text("INSERT INTO place_statuses (id, map_id, name, slug, color, functional_state, sort_order, is_default, is_active) VALUES (:id, :map_id, :name, :slug, '#2563EB', 'non_visited', :sort_order, :is_default, true)"),
            [
                {"id": status_id, "map_id": MIGRATION_MAP_ID, "name": name, "slug": slug, "sort_order": index * 10, "is_default": is_default}
                for index, (status_id, name, slug, is_default) in enumerate(MIGRATION_STATUS_ROWS, 1)
            ],
        )
        connection.execute(
            text("INSERT INTO places (id, name, map_id, status_id) VALUES (:id, 'Migration test', :map_id, :status_id)"),
            {"id": MIGRATION_PLACE_ID, "map_id": MIGRATION_MAP_ID, "status_id": MIGRATION_STATUS_ID},
        )

    try:
        command.downgrade(config, PREVIOUS_REVISION)
        previous_columns = {column["name"] for column in inspect(test_engine).get_columns("place_statuses")}
        assert "map_id" not in previous_columns
        assert "functional_state" not in previous_columns
        previous_indexes = {index["name"] for index in inspect(test_engine).get_indexes("place_statuses")}
        assert "place_statuses_map_slug_key" not in previous_indexes
        with test_engine.connect() as connection:
            assert connection.scalar(text("SELECT count(*) FROM place_statuses")) == len(MIGRATION_STATUS_ROWS)
            assert str(connection.scalar(
                text("SELECT status_id FROM places WHERE id = :id"), {"id": MIGRATION_PLACE_ID}
            )) == MIGRATION_STATUS_ID

        command.upgrade(config, MIGRATION_REVISION)
        status_columns = {column["name"]: column for column in inspect(test_engine).get_columns("place_statuses")}
        assert status_columns["map_id"]["nullable"] is False
        assert status_columns["functional_state"]["nullable"] is False
        status_indexes = {index["name"] for index in inspect(test_engine).get_indexes("place_statuses")}
        assert {
            "place_statuses_map_slug_key",
            "place_statuses_one_default_idx",
            "place_statuses_map_functional_state_idx",
        } <= status_indexes
        with test_engine.connect() as connection:
            assert connection.scalar(text("SELECT count(*) FROM place_statuses")) == len(MIGRATION_STATUS_ROWS)
            assert connection.scalar(text("SELECT count(*) FROM place_statuses WHERE map_id IS NULL OR functional_state IS NULL")) == 0
            assert dict(connection.execute(text("SELECT slug, functional_state FROM place_statuses")).all()) == {
                "a-faire": "non_visited",
                "fait": "visited",
                "a-verifier": "non_visited",
                "a-refaire": "visited",
                "inaccessible": "visited",
                "personnalise": "non_visited",
            }
            assert connection.scalar(text("SELECT count(*) FROM places WHERE status_id IS NULL")) == 0
            assert connection.scalar(
                text("SELECT ps.map_id = p.map_id FROM places p JOIN place_statuses ps ON ps.id = p.status_id WHERE p.id = :id"),
                {"id": MIGRATION_PLACE_ID},
            ) is True
    finally:
        # Always restore the shared integration database to the real current
        # head.  Keeping the historical migration revision here used to leave
        # tables introduced later in the chain absent for following tests.
        command.upgrade(config, "head")
        with test_engine.begin() as connection:
            connection.execute(text("DELETE FROM places WHERE id = :id"), {"id": MIGRATION_PLACE_ID})
            connection.execute(text("DELETE FROM poi_maps WHERE id = :id"), {"id": MIGRATION_MAP_ID})
