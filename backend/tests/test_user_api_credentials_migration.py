import pytest
from sqlalchemy import inspect, text


pytestmark = pytest.mark.integration
PARENT_REVISION = "b2e7c4a9d531"
CREDENTIAL_REVISION = "c6e8a1f4d290"
PRESERVED_TABLES = ("users", "user_sessions", "trips", "trip_days")


def test_user_api_credentials_upgrade_downgrade_upgrade_cycle(migration_environment) -> None:
    migration_environment.upgrade(PARENT_REVISION)
    engine = migration_environment.engine
    with engine.connect() as connection:
        before = {table: connection.scalar(text(f'SELECT count(*) FROM "{table}"')) for table in PRESERVED_TABLES}
    assert "user_api_credentials" not in inspect(engine).get_table_names()
    with engine.connect() as connection:
        assert {table: connection.scalar(text(f'SELECT count(*) FROM "{table}"')) for table in PRESERVED_TABLES} == before
    try:
        migration_environment.upgrade(CREDENTIAL_REVISION)
        inspector = inspect(engine)
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
        migration_environment.downgrade(PARENT_REVISION)
        assert "user_api_credentials" not in inspect(engine).get_table_names()
        with engine.connect() as connection:
            assert {table: connection.scalar(text(f'SELECT count(*) FROM "{table}"')) for table in PRESERVED_TABLES} == before
    finally:
        migration_environment.upgrade("heads")
    migration_environment.assert_at_head()
    assert "user_api_credentials" in inspect(engine).get_table_names()
