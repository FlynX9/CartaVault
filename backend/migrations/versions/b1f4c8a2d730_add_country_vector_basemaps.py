"""add country vector basemaps

Revision ID: b1f4c8a2d730
Revises: a6d2e9f4b871
Create Date: 2026-08-15
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "b1f4c8a2d730"
down_revision: str | Sequence[str] | None = "a6d2e9f4b871"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "vector_basemaps",
        sa.Column("country_code", sa.String(length=2), nullable=False),
        sa.Column("country_name", sa.String(length=120), nullable=False),
        sa.Column("source", sa.String(length=32), server_default=sa.text("'geofabrik'"), nullable=False),
        sa.Column("source_url", sa.String(length=512), nullable=False),
        sa.Column("state", sa.String(length=24), server_default=sa.text("'not_installed'"), nullable=False),
        sa.Column("phase", sa.String(length=64), nullable=True),
        sa.Column("progress", sa.Integer(), nullable=True),
        sa.Column("task_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("installed_at", sa.DateTime(), nullable=True),
        sa.Column("source_date", sa.DateTime(), nullable=True),
        sa.Column("version", sa.String(length=120), nullable=True),
        sa.Column("file_path", sa.String(length=255), nullable=True),
        sa.Column("file_size", sa.BigInteger(), nullable=True),
        sa.Column("source_size", sa.BigInteger(), nullable=True),
        sa.Column("min_zoom", sa.Integer(), nullable=True),
        sa.Column("max_zoom", sa.Integer(), nullable=True),
        sa.Column("schema", sa.String(length=64), nullable=True),
        sa.Column("last_error_code", sa.String(length=80), nullable=True),
        sa.Column("last_error_message", sa.Text(), nullable=True),
        sa.Column("generation_started_at", sa.DateTime(), nullable=True),
        sa.Column("generation_finished_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("progress IS NULL OR progress BETWEEN 0 AND 100", name="vector_basemaps_progress_check"),
        sa.CheckConstraint("state IN ('not_installed','downloading','generating','validating','ready','update_available','error','deleting')", name="vector_basemaps_state_check"),
        sa.ForeignKeyConstraint(["task_id"], ["background_tasks.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("country_code"),
    )
    op.create_index(
        "background_tasks_vector_basemap_active_key",
        "background_tasks",
        ["dedupe_key"],
        unique=True,
        postgresql_where=sa.text("task_type = 'vector_basemap_prepare' AND status IN ('pending','running')"),
    )


def downgrade() -> None:
    op.drop_index("background_tasks_vector_basemap_active_key", table_name="background_tasks")
    op.drop_table("vector_basemaps")
