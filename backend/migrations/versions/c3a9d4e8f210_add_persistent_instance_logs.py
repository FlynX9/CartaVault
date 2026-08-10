"""add persistent instance logs

Revision ID: c3a9d4e8f210
Revises: c2d8e7f4a91b
"""

from alembic import op
import sqlalchemy as sa


revision = "c3a9d4e8f210"
down_revision = "c2d8e7f4a91b"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "instance_logs",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("timestamp", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("level", sa.String(length=12), nullable=False),
        sa.Column("component", sa.String(length=32), nullable=False),
        sa.Column("logger", sa.String(length=160), nullable=False),
        sa.Column("message", sa.Text(), nullable=False),
    )
    op.create_index("ix_instance_logs_timestamp", "instance_logs", ["timestamp"])
    op.create_index("ix_instance_logs_level", "instance_logs", ["level"])
    op.create_index("ix_instance_logs_component", "instance_logs", ["component"])


def downgrade() -> None:
    op.drop_index("ix_instance_logs_component", table_name="instance_logs")
    op.drop_index("ix_instance_logs_level", table_name="instance_logs")
    op.drop_index("ix_instance_logs_timestamp", table_name="instance_logs")
    op.drop_table("instance_logs")
