import pytest

from tests.conftest import validate_test_database_url


pytestmark = pytest.mark.unit


def test_rejects_database_name_without_test(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv(
        "DATABASE_URL",
        "postgresql+psycopg://user:password@localhost/poi_manager",
    )

    with pytest.raises(pytest.UsageError, match="must contain 'test'"):
        validate_test_database_url(
            "postgresql+psycopg://user:password@localhost/other_database"
        )


def test_rejects_development_database_endpoint(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    database_url = (
        "postgresql+psycopg://user:password@localhost/poi_manager_test"
    )
    monkeypatch.setenv("DATABASE_URL", database_url)

    with pytest.raises(pytest.UsageError, match="must not target"):
        validate_test_database_url(database_url)


def test_accepts_dedicated_postgresql_test_database(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv(
        "DATABASE_URL",
        "postgresql+psycopg://user:password@localhost/poi_manager",
    )

    validated_url = validate_test_database_url(
        "postgresql+psycopg://user:password@localhost/poi_manager_test"
    )

    assert validated_url.database == "poi_manager_test"
