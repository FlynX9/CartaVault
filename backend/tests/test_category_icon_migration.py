from uuid import NAMESPACE_URL, uuid5

import pytest
from alembic import command
from alembic.config import Config
from alembic.runtime.migration import MigrationContext
from sqlalchemy import create_engine, text

from app.categories.icon_catalog import CATEGORY_ICON_IDS, DEFAULT_CATEGORY_ICON_ID
from app.categories.icon_migration import (
    LEGACY_CATEGORY_ICON_DEFAULT,
    LEGACY_CATEGORY_ICON_TO_ICONIFY,
)


pytestmark = pytest.mark.integration

MIGRATION_REVISION = "f3a7c1d9e842"
PARENT_REVISION = "e2a4b9d7c630"
TEST_CATEGORY_NAMESPACE = "https://poi-manager.test/category-icon-migration/"
UNKNOWN_ICON = "unknown-legacy-icon"
PRESERVED_ICONIFY_ICON = "mdi:wall"
SECURITY_SCHEMA_REVISION = "d8f4a2c7e910"
HEAD_REVISION = "c9f4a2d8e761"


def _upgrade_to_head_with_test_admin(config: Config, engine) -> None:
    with engine.connect() as connection:
        if MigrationContext.configure(connection).get_current_revision() == HEAD_REVISION:
            return
    command.upgrade(config, SECURITY_SCHEMA_REVISION)
    with engine.begin() as connection:
        admin_id = connection.scalar(text("INSERT INTO users (email, display_name, password_hash, is_admin, is_active) VALUES ('migration-cycle@example.test', 'Migration cycle', 'test-only-hash', true, true) ON CONFLICT (email) DO UPDATE SET is_admin=true, is_active=true RETURNING id"))
        connection.execute(text("UPDATE poi_maps SET owner_id=:admin_id WHERE owner_id IS NULL"), {"admin_id": admin_id})
        connection.execute(text("INSERT INTO map_memberships (map_id, user_id, role) SELECT id, :admin_id, 'owner' FROM poi_maps ON CONFLICT (map_id, user_id) DO UPDATE SET role='owner'"), {"admin_id": admin_id})
    command.upgrade(config, "head")


def _category_id(icon_id: str) -> str:
    return str(uuid5(NAMESPACE_URL, f"{TEST_CATEGORY_NAMESPACE}{icon_id}"))


def _category_rows() -> dict[str, str]:
    return {
        **LEGACY_CATEGORY_ICON_TO_ICONIFY,
        UNKNOWN_ICON: DEFAULT_CATEGORY_ICON_ID,
        PRESERVED_ICONIFY_ICON: PRESERVED_ICONIFY_ICON,
    }


def _read_icons(connection) -> dict[str, str]:
    return dict(
        connection.execute(
            text("SELECT name, icon FROM categories WHERE name LIKE 'Icon migration test:%'")
        ).all()
    )


def _delete_test_categories(connection, category_ids: list[str]) -> None:
    placeholders = ", ".join(
        f":category_id_{index}"
        for index in range(len(category_ids))
    )
    connection.execute(
        text(f"DELETE FROM categories WHERE id IN ({placeholders})"),
        {
            f"category_id_{index}": category_id
            for index, category_id in enumerate(category_ids)
        },
    )


def test_category_icon_migration_upgrade_downgrade_upgrade_cycle(
    test_database_url,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Exercise the category icon migration exclusively on poi_manager_test."""

    print(test_database_url.database)
    assert test_database_url.database == "poi_manager_test"
    monkeypatch.setenv(
        "DATABASE_URL",
        test_database_url.render_as_string(hide_password=False),
    )

    engine = create_engine(test_database_url, pool_pre_ping=True)
    config = Config("alembic.ini")
    expected_upgrade = _category_rows()
    category_ids = [_category_id(icon_id) for icon_id in expected_upgrade]

    try:
        command.downgrade(config, PARENT_REVISION)

        with engine.begin() as connection:
            _delete_test_categories(connection, category_ids)
            for legacy_or_iconify_icon in expected_upgrade:
                connection.execute(
                    text(
                        "INSERT INTO categories (id, name, icon) "
                        "VALUES (:id, :name, :icon)"
                    ),
                    {
                        "id": _category_id(legacy_or_iconify_icon),
                        "name": f"Icon migration test:{legacy_or_iconify_icon}",
                        "icon": legacy_or_iconify_icon,
                    },
                )

        command.upgrade(config, MIGRATION_REVISION)

        with engine.connect() as connection:
            migrated_icons = _read_icons(connection)
            default = connection.scalar(
                text(
                    "SELECT column_default FROM information_schema.columns "
                    "WHERE table_schema = 'public' AND table_name = 'categories' "
                    "AND column_name = 'icon'"
                )
            )
            all_icons = set(connection.scalars(text("SELECT icon FROM categories")))

        assert migrated_icons == {
            f"Icon migration test:{icon_id}": expected_icon
            for icon_id, expected_icon in expected_upgrade.items()
        }
        assert DEFAULT_CATEGORY_ICON_ID in (default or "")
        assert all_icons <= CATEGORY_ICON_IDS
        assert not all_icons.intersection(LEGACY_CATEGORY_ICON_TO_ICONIFY)

        command.downgrade(config, PARENT_REVISION)

        with engine.connect() as connection:
            downgraded_icons = _read_icons(connection)
            default = connection.scalar(
                text(
                    "SELECT column_default FROM information_schema.columns "
                    "WHERE table_schema = 'public' AND table_name = 'categories' "
                    "AND column_name = 'icon'"
                )
            )

        assert downgraded_icons == {
            f"Icon migration test:{legacy_icon}": legacy_icon
            for legacy_icon in LEGACY_CATEGORY_ICON_TO_ICONIFY
        } | {
            f"Icon migration test:{UNKNOWN_ICON}": LEGACY_CATEGORY_ICON_DEFAULT,
            f"Icon migration test:{PRESERVED_ICONIFY_ICON}": LEGACY_CATEGORY_ICON_DEFAULT,
        }
        assert LEGACY_CATEGORY_ICON_DEFAULT in (default or "")

        _upgrade_to_head_with_test_admin(config, engine)

        with engine.connect() as connection:
            final_revision = MigrationContext.configure(connection).get_current_revision()
            final_icons = set(connection.scalars(text("SELECT icon FROM categories")))

        assert final_revision == HEAD_REVISION
        assert final_icons <= CATEGORY_ICON_IDS
    finally:
        try:
            _upgrade_to_head_with_test_admin(config, engine)
            with engine.begin() as connection:
                _delete_test_categories(connection, category_ids)
        finally:
            engine.dispose()
