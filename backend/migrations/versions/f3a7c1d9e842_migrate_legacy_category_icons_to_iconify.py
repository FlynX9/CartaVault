"""migrate legacy category icons to Iconify

Revision ID: f3a7c1d9e842
Revises: e2a4b9d7c630
"""

from alembic import op
import sqlalchemy as sa

from app.categories.icon_catalog import CATEGORY_ICON_IDS, DEFAULT_CATEGORY_ICON_ID
from app.categories.icon_migration import (
    ICONIFY_TO_LEGACY_CATEGORY_ICON,
    LEGACY_CATEGORY_ICON_DEFAULT,
    LEGACY_CATEGORY_ICON_TO_ICONIFY,
)


revision = "f3a7c1d9e842"
down_revision = "e2a4b9d7c630"
branch_labels = None
depends_on = None


def _quote_sql(value: str) -> str:
    return f"'{value.replace("'", "''")}'"


def _upgrade_case_expression() -> str:
    legacy_cases = " ".join(
        f"WHEN icon = {_quote_sql(legacy_icon)} THEN {_quote_sql(iconify_icon)}"
        for legacy_icon, iconify_icon in LEGACY_CATEGORY_ICON_TO_ICONIFY.items()
    )
    valid_iconify_ids = ", ".join(
        _quote_sql(icon_id)
        for icon_id in sorted(CATEGORY_ICON_IDS)
    )
    return (
        "CASE "
        f"WHEN icon IN ({valid_iconify_ids}) THEN icon "
        f"{legacy_cases} "
        f"ELSE {_quote_sql(DEFAULT_CATEGORY_ICON_ID)} END"
    )


def _downgrade_case_expression() -> str:
    reverse_cases = " ".join(
        f"WHEN icon = {_quote_sql(iconify_icon)} THEN {_quote_sql(legacy_icon)}"
        for iconify_icon, legacy_icon in ICONIFY_TO_LEGACY_CATEGORY_ICON.items()
    )
    return f"CASE {reverse_cases} ELSE {_quote_sql(LEGACY_CATEGORY_ICON_DEFAULT)} END"


def upgrade() -> None:
    op.execute(sa.text(f"UPDATE categories SET icon = {_upgrade_case_expression()}"))
    op.alter_column(
        "categories",
        "icon",
        existing_type=sa.String(length=50),
        existing_nullable=False,
        server_default=sa.text(_quote_sql(DEFAULT_CATEGORY_ICON_ID)),
    )


def downgrade() -> None:
    """Restore legacy IDs; newer Iconify IDs deliberately collapse to map-pin."""

    op.execute(sa.text(f"UPDATE categories SET icon = {_downgrade_case_expression()}"))
    op.alter_column(
        "categories",
        "icon",
        existing_type=sa.String(length=50),
        existing_nullable=False,
        server_default=sa.text(_quote_sql(LEGACY_CATEGORY_ICON_DEFAULT)),
    )
