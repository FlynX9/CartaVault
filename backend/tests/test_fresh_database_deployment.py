from __future__ import annotations

from uuid import uuid4

import pytest
from alembic.config import Config
from alembic.script import ScriptDirectory
from sqlalchemy import create_engine, inspect, select, text
from sqlalchemy.engine import URL
from sqlalchemy.orm import sessionmaker

from app import cli, deployment
from app.auth.models import User


@pytest.mark.integration
def test_deployment_builds_a_clean_schema_and_owns_legacy_maps(
    test_engine,
    test_database_url: URL,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Validate clean installation without the retired SQL schema snapshot."""

    schema_name = f"fresh_install_{uuid4().hex}"
    with test_engine.begin() as connection:
        connection.execute(text(f'CREATE SCHEMA "{schema_name}"'))

    isolated_url = test_database_url.set(
        query={
            **dict(test_database_url.query),
            "options": f"-c search_path={schema_name},public",
        }
    )
    isolated_url_value = isolated_url.render_as_string(hide_password=False)
    isolated_engine = create_engine(isolated_url, pool_pre_ping=True)

    try:
        monkeypatch.setenv("DATABASE_URL", isolated_url_value)
        monkeypatch.setenv("CARTAVAULT_ALEMBIC_VERSION_SCHEMA", schema_name)
        monkeypatch.setattr(
            cli,
            "SessionLocal",
            sessionmaker(
                bind=isolated_engine,
                autoflush=False,
                expire_on_commit=False,
            ),
        )
        monkeypatch.setenv(
            "CARTAVAULT_BOOTSTRAP_ADMIN_EMAIL",
            "first-admin@example.test",
        )
        monkeypatch.setenv(
            "CARTAVAULT_BOOTSTRAP_ADMIN_NAME",
            "First administrator",
        )
        monkeypatch.setenv(
            "CARTAVAULT_BOOTSTRAP_ADMIN_PASSWORD",
            "test-only-bootstrap-password",
        )
        monkeypatch.setattr(
            cli,
            "hash_password",
            lambda password: f"argon2-test::{len(password)}",
        )

        deployment.prepare_administrator_schema(isolated_engine)
        with isolated_engine.begin() as connection:
            legacy_map_id = connection.scalar(
                text(
                    """
                    INSERT INTO poi_maps (name, country_id)
                    SELECT 'Legacy map', id FROM countries ORDER BY id LIMIT 1
                    RETURNING id
                    """
                )
            )

        assert cli.bootstrap_from_environment() == 0
        deployment.run_alembic_upgrade()
        assert cli.bootstrap_from_environment() == 0

        config = Config("alembic.ini")
        expected_heads = set(ScriptDirectory.from_config(config).get_heads())
        with isolated_engine.connect() as connection:
            assert connection.scalar(text("SELECT current_schema()")) == schema_name
            current_heads = set(
                connection.scalars(
                    text(f'SELECT version_num FROM "{schema_name}".alembic_version')
                )
            )
            tables = set(inspect(connection).get_table_names(schema=schema_name))
            owner_membership_count = connection.scalar(
                text(
                    """
                    SELECT count(*)
                    FROM poi_maps AS maps
                    JOIN map_memberships AS memberships
                      ON memberships.map_id = maps.id
                     AND memberships.user_id = maps.owner_id
                     AND memberships.role = 'owner'
                    WHERE maps.id = :map_id
                    """
                ),
                {"map_id": legacy_map_id},
            )

        assert current_heads == expected_heads
        assert {
            "users",
            "poi_maps",
            "places",
            "photos",
            "trips",
            "quota_profiles",
        }.issubset(tables)
        assert owner_membership_count == 1

        with sessionmaker(bind=isolated_engine)() as session:
            administrators = session.scalars(
                select(User).where(
                    User.is_admin.is_(True),
                    User.is_active.is_(True),
                )
            ).all()
        assert len(administrators) == 1
        assert administrators[0].email == "first-admin@example.test"
    finally:
        isolated_engine.dispose()
        with test_engine.begin() as connection:
            connection.execute(text(f'DROP SCHEMA IF EXISTS "{schema_name}" CASCADE'))
