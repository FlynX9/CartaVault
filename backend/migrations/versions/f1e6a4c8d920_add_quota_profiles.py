"""add reusable quota profiles

Revision ID: f1e6a4c8d920
Revises: e7a4c1d9b620
Create Date: 2026-07-22
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "f1e6a4c8d920"
down_revision: str | None = "e7a4c1d9b620"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

UNLIMITED_ID = "00000000-0000-0000-0000-000000000001"
COUNT_FIELDS = (
    "maps_max", "trips_total_max", "photos_total_max", "memberships_total_max",
    "pending_invitations_max", "places_per_map_max", "tags_per_map_max",
    "categories_per_map_max", "statuses_per_map_max", "trips_per_map_max",
    "members_per_map_max", "pending_invitations_per_map_max", "photos_per_place_max",
    "links_per_place_max", "days_per_trip_max", "steps_per_day_max",
)


def upgrade() -> None:
    columns: list[sa.Column] = [
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("is_default", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("is_system", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        *[sa.Column(field, sa.Integer(), nullable=True) for field in COUNT_FIELDS[:2]],
        sa.Column("storage_bytes_max", sa.BigInteger(), nullable=True),
        *[sa.Column(field, sa.Integer(), nullable=True) for field in COUNT_FIELDS[2:]],
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    ]
    op.create_table("quota_profiles", *columns)
    op.create_index("quota_profiles_name_key", "quota_profiles", [sa.text("lower(btrim(name))")], unique=True)
    op.create_index("quota_profiles_one_default_idx", "quota_profiles", ["is_default"], unique=True, postgresql_where=sa.text("is_default"))
    for field in (*COUNT_FIELDS, "storage_bytes_max"):
        op.create_check_constraint(f"quota_profiles_{field}_nonnegative", "quota_profiles", f"{field} IS NULL OR {field} >= 0")

    op.execute(
        sa.text(
            "INSERT INTO quota_profiles (id, name, description, is_default, is_system, is_active) "
            "VALUES (CAST(:id AS uuid), 'Unlimited', 'System fallback profile with no resource limits.', true, true, true)"
        ).bindparams(id=UNLIMITED_ID)
    )
    op.add_column("users", sa.Column("quota_profile_id", postgresql.UUID(as_uuid=True), server_default=sa.text("'00000000-0000-0000-0000-000000000001'::uuid"), nullable=True))
    op.execute(sa.text("UPDATE users SET quota_profile_id = CAST(:id AS uuid)").bindparams(id=UNLIMITED_ID))
    op.alter_column("users", "quota_profile_id", nullable=False)
    op.create_foreign_key("users_quota_profile_id_fkey", "users", "quota_profiles", ["quota_profile_id"], ["id"], ondelete="RESTRICT")
    op.create_index("users_quota_profile_id_idx", "users", ["quota_profile_id"])


def downgrade() -> None:
    op.drop_index("users_quota_profile_id_idx", table_name="users")
    op.drop_constraint("users_quota_profile_id_fkey", "users", type_="foreignkey")
    op.drop_column("users", "quota_profile_id")
    op.drop_table("quota_profiles")
