import pytest
from alembic import command
from alembic.config import Config
from alembic.runtime.migration import MigrationContext
from alembic.script import ScriptDirectory
from sqlalchemy import inspect, text

from app.auth.models import UserApiCredential


pytestmark = pytest.mark.integration
PARENT_REVISION = "b2e7c4a9d531"
CREDENTIAL_REVISION = "c6e8a1f4d290"
PRESERVED_TABLES = ("users", "user_sessions", "trips", "trip_days")


def test_user_api_credentials_upgrade_downgrade_upgrade_cycle(test_engine, test_database_url, monkeypatch: pytest.MonkeyPatch) -> None:
    assert test_database_url.database == "poi_manager_test"
    monkeypatch.setenv("DATABASE_URL", test_database_url.render_as_string(hide_password=False))
    config = Config("alembic.ini")
    command.downgrade(config, PARENT_REVISION)
    # Base.metadata.create_all() prepares feature tables for integration tests,
    # even when Alembic is still stamped at the parent revision.
    UserApiCredential.__table__.drop(test_engine, checkfirst=True)
    with test_engine.connect() as connection:
        before = {table: connection.scalar(text(f'SELECT count(*) FROM "{table}"')) for table in PRESERVED_TABLES}
    command.downgrade(config, PARENT_REVISION)
    assert "user_api_credentials" not in inspect(test_engine).get_table_names()
    with test_engine.connect() as connection:
        assert {table: connection.scalar(text(f'SELECT count(*) FROM "{table}"')) for table in PRESERVED_TABLES} == before
    try:
        command.upgrade(config, CREDENTIAL_REVISION)
        inspector = inspect(test_engine)
        assert "user_api_credentials" in inspector.get_table_names()
        assert {item["name"] for item in inspector.get_columns("user_api_credentials")} == {
            "id", "user_id", "provider", "encrypted_secret", "encryption_version", "secret_last4", "created_at", "updated_at", "verified_at", "last_used_at", "last_error_code",
        }
        assert {item["name"] for item in inspector.get_unique_constraints("user_api_credentials")} == {"user_api_credentials_user_provider_key"}
        assert {item["name"] for item in inspector.get_check_constraints("user_api_credentials")} == {"user_api_credentials_provider_check", "user_api_credentials_encryption_version_check"}
        indexes = {item["name"]: item for item in inspector.get_indexes("user_api_credentials")}
        assert "user_api_credentials_user_id_idx" in indexes
        assert indexes["user_api_credentials_user_id_idx"]["column_names"] == ["user_id"]
        foreign_keys = inspector.get_foreign_keys("user_api_credentials")
        assert len(foreign_keys) == 1 and foreign_keys[0]["referred_table"] == "users" and foreign_keys[0]["options"]["ondelete"] == "CASCADE"
        command.downgrade(config, PARENT_REVISION)
        assert "user_api_credentials" not in inspect(test_engine).get_table_names()
        with test_engine.connect() as connection:
            assert {table: connection.scalar(text(f'SELECT count(*) FROM "{table}"')) for table in PRESERVED_TABLES} == before
    finally:
        command.upgrade(config, "head")
    with test_engine.connect() as connection:
        assert MigrationContext.configure(connection).get_current_revision() == ScriptDirectory.from_config(config).get_current_head()
    assert "user_api_credentials" in inspect(test_engine).get_table_names()
