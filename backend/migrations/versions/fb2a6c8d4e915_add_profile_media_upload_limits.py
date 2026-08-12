"""add profile-specific media upload limits

Revision ID: fb2a6c8d4e915
Revises: d7a3c9f1e842
"""

from alembic import op
import sqlalchemy as sa


revision = "fb2a6c8d4e915"
down_revision = "d7a3c9f1e842"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("quota_profiles", sa.Column("image_upload_megabytes_max", sa.Integer(), nullable=True))
    op.add_column("quota_profiles", sa.Column("image_dimension_max", sa.Integer(), nullable=True))
    op.create_check_constraint("quota_profiles_image_upload_megabytes_max_nonnegative", "quota_profiles", "image_upload_megabytes_max IS NULL OR image_upload_megabytes_max >= 0")
    op.create_check_constraint("quota_profiles_image_dimension_max_nonnegative", "quota_profiles", "image_dimension_max IS NULL OR image_dimension_max >= 0")


def downgrade() -> None:
    op.drop_constraint("quota_profiles_image_dimension_max_nonnegative", "quota_profiles", type_="check")
    op.drop_constraint("quota_profiles_image_upload_megabytes_max_nonnegative", "quota_profiles", type_="check")
    op.drop_column("quota_profiles", "image_dimension_max")
    op.drop_column("quota_profiles", "image_upload_megabytes_max")
