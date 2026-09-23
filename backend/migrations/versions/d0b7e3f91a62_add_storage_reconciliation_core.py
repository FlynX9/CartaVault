"""add durable storage reconciliation core

Revision ID: d0b7e3f91a62
Revises: c9f2a4d81e57
Create Date: 2026-08-29
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "d0b7e3f91a62"
down_revision: str | None = "c9f2a4d81e57"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "storage_operations",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("operation", sa.String(length=16), server_default=sa.text("'delete'"), nullable=False),
        sa.Column("backend", sa.String(length=16), nullable=False),
        sa.Column("namespace", sa.String(length=16), nullable=False),
        sa.Column("object_key", sa.Text(), nullable=False),
        sa.Column("purpose", sa.String(length=64), nullable=False),
        sa.Column("status", sa.String(length=16), server_default=sa.text("'pending'"), nullable=False),
        sa.Column("attempt_count", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column("next_attempt_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.Column("last_error_code", sa.String(length=64), nullable=True),
        sa.Column("last_error_message", sa.String(length=255), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint("operation = 'delete'", name="storage_operations_operation_check"),
        sa.CheckConstraint("backend IN ('local', 's3')", name="storage_operations_backend_check"),
        sa.CheckConstraint("namespace IN ('media', 'avatar')", name="storage_operations_namespace_check"),
        sa.CheckConstraint("status IN ('pending', 'failed')", name="storage_operations_status_check"),
        sa.CheckConstraint("attempt_count >= 0", name="storage_operations_attempt_count_nonnegative"),
        sa.CheckConstraint("length(object_key) > 0", name="storage_operations_object_key_nonempty"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "operation", "backend", "namespace", "object_key",
            name="storage_operations_active_identity_key",
        ),
    )
    op.create_index(
        "storage_operations_recovery_idx",
        "storage_operations",
        ["status", "next_attempt_at", "created_at"],
        unique=False,
    )

    op.add_column(
        "photos",
        sa.Column("storage_state", sa.String(length=16), server_default=sa.text("'unchecked'"), nullable=False),
    )
    op.add_column("photos", sa.Column("storage_checked_at", sa.DateTime(), nullable=True))
    op.create_check_constraint(
        "photos_storage_state_check",
        "photos",
        "storage_state IN ('unchecked', 'available', 'missing')",
    )
    op.create_index("photos_storage_checked_at_idx", "photos", ["storage_checked_at"], unique=False)

    op.add_column(
        "trip_night_photos",
        sa.Column("storage_state", sa.String(length=16), server_default=sa.text("'unchecked'"), nullable=False),
    )
    op.add_column("trip_night_photos", sa.Column("storage_checked_at", sa.DateTime(), nullable=True))
    op.create_check_constraint(
        "trip_night_photos_storage_state_check",
        "trip_night_photos",
        "storage_state IN ('unchecked', 'available', 'missing')",
    )
    op.create_index(
        "trip_night_photos_storage_checked_at_idx",
        "trip_night_photos",
        ["storage_checked_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("trip_night_photos_storage_checked_at_idx", table_name="trip_night_photos")
    op.drop_constraint("trip_night_photos_storage_state_check", "trip_night_photos", type_="check")
    op.drop_column("trip_night_photos", "storage_checked_at")
    op.drop_column("trip_night_photos", "storage_state")

    op.drop_index("photos_storage_checked_at_idx", table_name="photos")
    op.drop_constraint("photos_storage_state_check", "photos", type_="check")
    op.drop_column("photos", "storage_checked_at")
    op.drop_column("photos", "storage_state")

    op.drop_index("storage_operations_recovery_idx", table_name="storage_operations")
    op.drop_table("storage_operations")
