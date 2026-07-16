from __future__ import annotations

import os
import subprocess
import sys

import pytest
from sqlalchemy import inspect, select, update
from sqlalchemy.orm import Session, configure_mappers

import app.models
from app.auth.models import User
from app.cli import create_admin
from app.countries.models import Country
from app.main import validate_startup_security_state
from app.maps.models import PoiMap
from app.places.models import Place


@pytest.mark.unit
def test_central_registry_configures_all_mappers() -> None:
    configure_mappers()

    assert inspect(PoiMap).relationships["country"].mapper.class_ is Country
    assert inspect(PoiMap).relationships["places"].mapper.class_ is Place
    assert inspect(Place).relationships["map"].mapper.class_ is PoiMap


@pytest.mark.unit
def test_cli_registry_does_not_import_fastapi_application() -> None:
    command = (
        "import sys; import app.models; "
        "assert 'app.main' not in sys.modules; "
        "from sqlalchemy.orm import configure_mappers; configure_mappers(); "
        "import app.cli; assert 'app.main' not in sys.modules"
    )
    result = subprocess.run(
        [sys.executable, "-c", command],
        cwd=os.fspath(os.path.dirname(os.path.dirname(__file__))),
        capture_output=True,
        text=True,
        check=False,
    )

    assert result.returncode == 0, result.stderr


@pytest.mark.integration
def test_create_admin_is_normalized_unique_and_satisfies_startup_guard(
    database_session: Session,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    database_session.execute(update(User).values(is_admin=False))
    database_session.flush()
    with pytest.raises(RuntimeError, match="No active CartaVault administrator"):
        validate_startup_security_state(database_session)

    def test_session_factory() -> Session:
        return Session(
            bind=database_session.get_bind(),
            expire_on_commit=False,
            join_transaction_mode="create_savepoint",
        )

    monkeypatch.setattr("app.cli.SessionLocal", test_session_factory)
    monkeypatch.setattr("app.cli.hash_password", lambda password: f"argon2-test::{len(password)}")
    password = "a secret test password"
    email = "  CLI.Admin@Example.TEST "

    assert create_admin(email, "CLI administrator", password) == 0
    output = capsys.readouterr()
    user = database_session.scalar(select(User).where(User.email == "cli.admin@example.test"))
    assert user is not None
    assert user.is_admin is True
    assert user.is_active is True
    assert user.password_hash.startswith("argon2-test::")
    assert password not in output.out
    assert password not in output.err
    validate_startup_security_state(database_session)

    assert create_admin(email, "Duplicate", password) == 1
    duplicate_output = capsys.readouterr()
    assert "already exists" in duplicate_output.err
    assert password not in duplicate_output.err
    assert database_session.scalars(
        select(User).where(User.email == "cli.admin@example.test")
    ).all() == [user]
