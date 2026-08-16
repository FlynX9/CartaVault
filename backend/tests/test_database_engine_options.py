from app.database import _engine_options


def test_sqlite_engine_options_omit_queue_pool_settings() -> None:
    assert _engine_options("sqlite://") == {"pool_pre_ping": True}


def test_postgresql_engine_options_include_configured_pool_settings() -> None:
    options = _engine_options("postgresql+psycopg://user:password@database/cartavault")

    assert options["pool_pre_ping"] is True
    assert options["pool_size"] > 0
    assert options["max_overflow"] >= 0
    assert options["pool_timeout"] > 0
    assert options["pool_recycle"] > 0
