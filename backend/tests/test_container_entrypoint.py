import pytest

from app.container_entrypoint import build_default_command, run


@pytest.mark.unit
def test_default_container_command_does_not_trust_proxy_headers(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("CARTAVAULT_FORWARDED_ALLOW_IPS", raising=False)
    command = build_default_command()
    assert "--no-proxy-headers" in command
    assert "--forwarded-allow-ips" not in command


@pytest.mark.unit
def test_container_command_trusts_only_configured_proxies(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("CARTAVAULT_FORWARDED_ALLOW_IPS", "172.18.0.2,10.0.0.0/8")
    command = build_default_command()
    assert command[-3:] == ("--proxy-headers", "--forwarded-allow-ips", "172.18.0.2,10.0.0.0/8")


@pytest.mark.unit
def test_container_command_rejects_wildcard_proxy_trust(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("CARTAVAULT_FORWARDED_ALLOW_IPS", "*")
    with pytest.raises(RuntimeError, match="wildcard trust is forbidden"):
        build_default_command()


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
