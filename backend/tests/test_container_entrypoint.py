import pytest

from app.container_entrypoint import run


@pytest.mark.unit
def test_container_entrypoint_stops_when_migration_fails() -> None:
    executed: list[tuple[str, tuple[str, ...]]] = []

    result = run(
        ("python", "-m", "uvicorn"),
        migrate=lambda: 1,
        exec_process=lambda executable, command: executed.append(
            (executable, tuple(command))
        ),
    )

    assert result == 1
    assert executed == []


@pytest.mark.unit
def test_container_entrypoint_replaces_itself_after_successful_migration() -> None:
    executed: list[tuple[str, tuple[str, ...]]] = []
    command = ("python", "-m", "uvicorn", "app.main:app")

    result = run(
        command,
        migrate=lambda: 0,
        exec_process=lambda executable, arguments: executed.append(
            (executable, tuple(arguments))
        ),
    )

    assert result == 0
    assert executed == [("python", command)]
