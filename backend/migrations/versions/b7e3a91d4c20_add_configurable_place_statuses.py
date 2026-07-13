"""add configurable place statuses

Revision ID: b7e3a91d4c20
Revises: 6f2d8a4c91b0
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "b7e3a91d4c20"
down_revision: str | None = "6f2d8a4c91b0"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


DEFAULT_STATUS_ID = "10000000-0000-4000-8000-000000000001"
INITIAL_STATUSES = (
    (DEFAULT_STATUS_ID, "À faire", "a-faire", "#2563EB", 10, True),
    ("10000000-0000-4000-8000-000000000002", "Fait", "fait", "#16A34A", 20, False),
    ("10000000-0000-4000-8000-000000000003", "À vérifier", "a-verifier", "#D97706", 30, False),
    ("10000000-0000-4000-8000-000000000004", "À revisiter", "a-revisiter", "#7C3AED", 40, False),
    ("10000000-0000-4000-8000-000000000005", "Inaccessible", "inaccessible", "#DC2626", 50, False),
)


def upgrade() -> None:
    op.create_table(
        "place_statuses",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("slug", sa.String(length=100), nullable=False),
        sa.Column("color", sa.String(length=7), nullable=False),
        sa.Column("sort_order", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column("is_default", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint(
            "color ~ '^#[0-9A-F]{6}$'",
            name="place_statuses_color_format",
        ),
        sa.CheckConstraint(
            "sort_order >= 0",
            name="place_statuses_sort_order_nonnegative",
        ),
        sa.CheckConstraint(
            "btrim(name) <> ''",
            name="place_statuses_name_nonempty",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("slug", name="place_statuses_slug_key"),
    )
    op.create_index(
        "place_statuses_one_default_idx",
        "place_statuses",
        ["is_default"],
        unique=True,
        postgresql_where=sa.text("is_default"),
    )

    statuses_table = sa.table(
        "place_statuses",
        sa.column("id", postgresql.UUID(as_uuid=True)),
        sa.column("name", sa.String()),
        sa.column("slug", sa.String()),
        sa.column("color", sa.String()),
        sa.column("sort_order", sa.Integer()),
        sa.column("is_default", sa.Boolean()),
        sa.column("is_active", sa.Boolean()),
    )
    op.bulk_insert(
        statuses_table,
        [
            {
                "id": status_id,
                "name": name,
                "slug": slug,
                "color": color,
                "sort_order": sort_order,
                "is_default": is_default,
                "is_active": True,
            }
            for status_id, name, slug, color, sort_order, is_default in INITIAL_STATUSES
        ],
    )

    op.add_column(
        "places",
        sa.Column("status_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        "places_status_id_fkey",
        "places",
        "place_statuses",
        ["status_id"],
        ["id"],
        ondelete="RESTRICT",
    )
    op.execute(
        sa.text(
            "UPDATE places SET status_id = :status_id WHERE status_id IS NULL"
        ).bindparams(
            sa.bindparam(
                "status_id",
                value=DEFAULT_STATUS_ID,
                type_=postgresql.UUID(as_uuid=True),
            )
        )
    )
    connection = op.get_bind()
    missing_status_count = connection.scalar(
        sa.text("SELECT count(*) FROM places WHERE status_id IS NULL")
    )
    if missing_status_count:
        raise RuntimeError("Unable to backfill every place tracking status")
    op.alter_column("places", "status_id", nullable=False)
    op.create_index("places_status_id_idx", "places", ["status_id"], unique=False)


def downgrade() -> None:
    op.drop_index("places_status_id_idx", table_name="places")
    op.drop_constraint("places_status_id_fkey", "places", type_="foreignkey")
    op.drop_column("places", "status_id")
    op.drop_index("place_statuses_one_default_idx", table_name="place_statuses")
    op.drop_table("place_statuses")
