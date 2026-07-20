"""add advanced place features

Revision ID: d2f7a9c4e610
Revises: c6e8a1f4d290
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "d2f7a9c4e610"
down_revision = "c6e8a1f4d290"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("poi_maps", sa.Column("place_field_config", postgresql.JSONB(astext_type=sa.Text()), server_default=sa.text("'{}'::jsonb"), nullable=False))
    op.add_column("categories", sa.Column("marks_as_visited", sa.Boolean(), server_default=sa.text("false"), nullable=False))
    op.add_column("places", sa.Column("is_favorite", sa.Boolean(), server_default=sa.text("false"), nullable=False))
    op.add_column("places", sa.Column("interest_rating", sa.SmallInteger(), nullable=True))
    op.add_column("places", sa.Column("visit_rating", sa.SmallInteger(), nullable=True))
    op.add_column("places", sa.Column("deleted_at", sa.DateTime(), nullable=True))
    op.add_column("places", sa.Column("deleted_by_user_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.create_foreign_key("places_deleted_by_user_id_fkey", "places", "users", ["deleted_by_user_id"], ["id"], ondelete="SET NULL")
    op.create_check_constraint("places_interest_rating_range", "places", "interest_rating IS NULL OR interest_rating BETWEEN 1 AND 5")
    op.create_check_constraint("places_visit_rating_range", "places", "visit_rating IS NULL OR visit_rating BETWEEN 1 AND 5")
    op.create_index("places_deleted_at_idx", "places", ["deleted_at"])
    op.create_index("places_map_favorite_idx", "places", ["map_id", "is_favorite"])
    op.create_table(
        "place_links",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("place_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("url", sa.String(length=2048), nullable=False),
        sa.Column("label", sa.String(length=120), nullable=True),
        sa.Column("sort_order", sa.SmallInteger(), server_default=sa.text("0"), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("url ~ '^https?://[^[:space:]]+$'", name="place_links_http_url_check"),
        sa.CheckConstraint("sort_order >= 0", name="place_links_sort_order_check"),
        sa.ForeignKeyConstraint(["place_id"], ["places.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("place_links_place_id_idx", "place_links", ["place_id"])
    op.create_table(
        "place_history",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("place_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("action", sa.String(length=40), nullable=False),
        sa.Column("changes", postgresql.JSONB(astext_type=sa.Text()), server_default=sa.text("'{}'::jsonb"), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["place_id"], ["places.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("place_history_place_created_idx", "place_history", ["place_id", "created_at"])


def downgrade() -> None:
    op.drop_index("place_history_place_created_idx", table_name="place_history")
    op.drop_table("place_history")
    op.drop_index("place_links_place_id_idx", table_name="place_links")
    op.drop_table("place_links")
    op.drop_index("places_map_favorite_idx", table_name="places")
    op.drop_index("places_deleted_at_idx", table_name="places")
    op.drop_constraint("places_visit_rating_range", "places", type_="check")
    op.drop_constraint("places_interest_rating_range", "places", type_="check")
    op.drop_constraint("places_deleted_by_user_id_fkey", "places", type_="foreignkey")
    op.drop_column("places", "deleted_by_user_id")
    op.drop_column("places", "deleted_at")
    op.drop_column("places", "visit_rating")
    op.drop_column("places", "interest_rating")
    op.drop_column("places", "is_favorite")
    op.drop_column("categories", "marks_as_visited")
    op.drop_column("poi_maps", "place_field_config")
