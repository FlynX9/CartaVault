"""add persistent POI annotations

Revision ID: f7b4c9d2e610
Revises: e6b4d8f2a235
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "f7b4c9d2e610"
down_revision = "e6b4d8f2a235"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table("annotation_templates",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("map_id", postgresql.UUID(as_uuid=True), nullable=False), sa.Column("name", sa.String(100), nullable=False),
        sa.Column("shape_type", sa.String(20), nullable=False), sa.Column("icon", sa.String(80), server_default=sa.text("'tabler:map-pin'"), nullable=False),
        sa.Column("color", sa.String(7), server_default=sa.text("'#0FA68A'"), nullable=False), sa.Column("sort_order", sa.Integer(), server_default=sa.text("0"), nullable=False), sa.Column("is_active", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False), sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("shape_type IN ('rectangle', 'triangle', 'circle', 'line', 'path')", name="annotation_templates_shape_type_check"), sa.CheckConstraint("sort_order >= 0", name="annotation_templates_sort_order_check"),
        sa.ForeignKeyConstraint(["map_id"], ["poi_maps.id"], ondelete="CASCADE"), sa.PrimaryKeyConstraint("id"))
    op.create_index("annotation_templates_map_name_key", "annotation_templates", ["map_id", sa.text("lower(btrim(name))")], unique=True)
    op.create_table("place_annotations",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), nullable=False), sa.Column("place_id", postgresql.UUID(as_uuid=True), nullable=False), sa.Column("template_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("geometry", postgresql.JSONB(), nullable=False), sa.Column("radius_meters", sa.Float()), sa.Column("title", sa.String(160)), sa.Column("description", sa.Text()),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False), sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("radius_meters IS NULL OR radius_meters > 0", name="place_annotations_radius_check"),
        sa.ForeignKeyConstraint(["place_id"], ["places.id"], ondelete="CASCADE"), sa.ForeignKeyConstraint(["template_id"], ["annotation_templates.id"], ondelete="RESTRICT"), sa.PrimaryKeyConstraint("id"))
    op.create_index("place_annotations_place_id_idx", "place_annotations", ["place_id"]); op.create_index("place_annotations_template_id_idx", "place_annotations", ["template_id"])


def downgrade() -> None:
    op.drop_index("place_annotations_template_id_idx", table_name="place_annotations"); op.drop_index("place_annotations_place_id_idx", table_name="place_annotations"); op.drop_table("place_annotations")
    op.drop_index("annotation_templates_map_name_key", table_name="annotation_templates"); op.drop_table("annotation_templates")
