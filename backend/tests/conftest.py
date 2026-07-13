import os
import shutil
from collections.abc import Generator
from pathlib import Path

import pytest
from sqlalchemy import Engine, create_engine, text
from sqlalchemy.engine import URL, make_url
from sqlalchemy.orm import Session
from starlette.testclient import TestClient

from app.database import Base, get_db
from app.countries.catalog import load_country_catalog
from app.countries.models import Country
from app.maps.models import PoiMap
from app.main import app


MISSING_TEST_DATABASE_REASON = (
    "TEST_DATABASE_URL is not configured; integration tests require "
    "a dedicated PostgreSQL/PostGIS test database"
)


class DatabaseAccessForbidden:
    """Fail loudly if a database-free API test reaches its endpoint body."""

    def __getattr__(self, attribute_name: str) -> object:
        raise AssertionError(
            "A database-free test attempted to use a database session: "
            f"{attribute_name}"
        )


def validate_test_database_url(raw_url: str) -> URL:
    """Reject development-like or non-PostgreSQL integration databases."""

    test_url = make_url(raw_url)

    if not test_url.drivername.startswith("postgresql"):
        raise pytest.UsageError(
            "TEST_DATABASE_URL must use PostgreSQL/PostGIS"
        )

    database_name = test_url.database or ""

    if "test" not in database_name.lower():
        raise pytest.UsageError(
            "The TEST_DATABASE_URL database name must contain 'test'"
        )

    development_url_value = os.getenv("DATABASE_URL")

    if development_url_value:
        development_url = make_url(development_url_value)
        same_endpoint = (
            test_url.host == development_url.host
            and test_url.port == development_url.port
            and test_url.database == development_url.database
        )

        if same_endpoint:
            raise pytest.UsageError(
                "TEST_DATABASE_URL must not target DATABASE_URL"
            )

    return test_url


@pytest.fixture(scope="session")
def test_database_url() -> URL:
    """Return only an explicitly configured and defensively validated URL."""

    raw_url = os.getenv("TEST_DATABASE_URL")

    if not raw_url:
        pytest.skip(MISSING_TEST_DATABASE_REASON)

    return validate_test_database_url(raw_url)


@pytest.fixture(scope="session")
def test_engine(test_database_url: URL) -> Generator[Engine, None, None]:
    """Prepare model tables only inside the validated test database."""

    engine = create_engine(
        test_database_url,
        pool_pre_ping=True,
    )

    try:
        with engine.connect() as connection:
            postgis_available = connection.scalar(
                text(
                    "SELECT EXISTS ("
                    "SELECT 1 FROM pg_extension WHERE extname = 'postgis'"
                    ")"
                )
            )

        if not postgis_available:
            raise pytest.UsageError(
                "The TEST_DATABASE_URL database must enable PostGIS"
            )

        Base.metadata.create_all(engine)
        with engine.begin() as connection:
            existing_countries = connection.scalar(
                text("SELECT count(*) FROM countries")
            )
            if existing_countries == 0:
                connection.execute(
                    Country.__table__.insert(),
                    [dict(country) for country in load_country_catalog()],
                )
        yield engine
    finally:
        engine.dispose()


@pytest.fixture
def database_session(
    test_engine: Engine,
) -> Generator[Session, None, None]:
    """Roll back every application commit with an external transaction."""

    connection = test_engine.connect()
    transaction = connection.begin()
    session = Session(
        bind=connection,
        expire_on_commit=False,
        join_transaction_mode="create_savepoint",
    )

    try:
        yield session
    finally:
        session.close()

        if transaction.is_active:
            transaction.rollback()

        connection.close()


@pytest.fixture
def france_country(database_session: Session) -> Country:
    return database_session.query(Country).filter_by(iso_alpha3="FRA").one()


@pytest.fixture
def poi_map(database_session: Session, france_country: Country) -> PoiMap:
    result = PoiMap(name="France", country_id=france_country.id)
    database_session.add(result)
    database_session.flush()
    return result


@pytest.fixture
def photo_storage(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> Generator[Path, None, None]:
    """Redirect every photo operation to one pytest-owned directory."""

    storage_root = tmp_path / "photo-storage"
    monkeypatch.setenv("PHOTO_STORAGE_PATH", str(storage_root))

    yield storage_root

    remaining_files = [
        path
        for path in storage_root.rglob("*")
        if path.is_file()
    ] if storage_root.exists() else []

    assert not remaining_files, (
        "Photo tests left files behind: "
        f"{remaining_files}"
    )

    shutil.rmtree(storage_root, ignore_errors=True)


@pytest.fixture
def api_client() -> Generator[TestClient, None, None]:
    """Provide a client that cannot reach any real database."""

    def override_get_db() -> Generator[DatabaseAccessForbidden, None, None]:
        yield DatabaseAccessForbidden()

    app.dependency_overrides[get_db] = override_get_db

    try:
        with TestClient(app) as client:
            yield client
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.fixture
def integration_client(
    database_session: Session,
    photo_storage: Path,
) -> Generator[TestClient, None, None]:
    """Inject the isolated SQLAlchemy session into the FastAPI app."""

    del photo_storage

    def override_get_db() -> Generator[Session, None, None]:
        yield database_session

    app.dependency_overrides[get_db] = override_get_db

    try:
        with TestClient(app) as client:
            yield client
    finally:
        app.dependency_overrides.pop(get_db, None)
