"""add multi-user security schema and map-scoped taxonomies

Revision ID: d8f4a2c7e910
Revises: a91d3b6e7f24
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "d8f4a2c7e910"
down_revision = "a91d3b6e7f24"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("email", sa.String(320), nullable=False),
        sa.Column("display_name", sa.String(120), nullable=False),
        sa.Column("password_hash", sa.String(512), nullable=False),
        sa.Column("is_admin", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.Column("last_login_at", sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("email", name="users_email_key"),
    )
    op.create_index("ix_users_email", "users", ["email"], unique=True)
    op.create_table(
        "user_sessions",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("token_hash", sa.String(64), nullable=False),
        sa.Column("csrf_token_hash", sa.String(64), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("last_used_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.Column("revoked_at", sa.DateTime(), nullable=True),
        sa.Column("user_agent", sa.String(512), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("user_sessions_token_hash_key", "user_sessions", ["token_hash"], unique=True)
    op.create_index("user_sessions_user_id_idx", "user_sessions", ["user_id"])
    op.create_index("user_sessions_expires_at_idx", "user_sessions", ["expires_at"])

    op.drop_constraint("poi_maps_country_id_key", "poi_maps", type_="unique")
    op.add_column("poi_maps", sa.Column("owner_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.add_column("poi_maps", sa.Column("is_private", sa.Boolean(), server_default=sa.text("true"), nullable=False))
    op.create_foreign_key("poi_maps_owner_id_fkey", "poi_maps", "users", ["owner_id"], ["id"], ondelete="RESTRICT")

    op.create_table(
        "map_memberships",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("map_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("role", sa.String(16), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint("role IN ('owner', 'editor', 'viewer')", name="map_memberships_role_check"),
        sa.ForeignKeyConstraint(["map_id"], ["poi_maps.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("map_id", "user_id", name="map_memberships_map_user_key"),
    )
    op.create_index("map_memberships_one_owner_idx", "map_memberships", ["map_id"], unique=True, postgresql_where=sa.text("role = 'owner'"))
    op.create_table(
        "map_invitations",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("map_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("email", sa.String(320), nullable=False),
        sa.Column("role", sa.String(16), nullable=False),
        sa.Column("token_hash", sa.String(64), nullable=False),
        sa.Column("created_by_user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("accepted_at", sa.DateTime(), nullable=True),
        sa.Column("revoked_at", sa.DateTime(), nullable=True),
        sa.CheckConstraint("role IN ('editor', 'viewer')", name="map_invitations_role_check"),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["map_id"], ["poi_maps.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("map_invitations_token_hash_key", "map_invitations", ["token_hash"], unique=True)
    op.create_index("map_invitations_map_id_idx", "map_invitations", ["map_id"])

    op.add_column("categories", sa.Column("map_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.add_column("tags", sa.Column("map_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.drop_constraint("tags_name_key", "tags", type_="unique")
    connection = op.get_bind()
    connection.execute(sa.text("""
        CREATE TEMP TABLE category_map_copy (old_id uuid, map_id uuid, new_id uuid, PRIMARY KEY (old_id, map_id));
        INSERT INTO category_map_copy
        SELECT c.id, m.id, gen_random_uuid() FROM categories c CROSS JOIN poi_maps m;
        INSERT INTO categories (id, map_id, name, description, icon)
        SELECT x.new_id, x.map_id, c.name, c.description, c.icon FROM category_map_copy x JOIN categories c ON c.id = x.old_id;
        UPDATE place_categories pc SET category_id = x.new_id
        FROM places p, category_map_copy x
        WHERE p.id = pc.place_id AND x.old_id = pc.category_id AND x.map_id = p.map_id;
        DELETE FROM categories WHERE map_id IS NULL;

        CREATE TEMP TABLE tag_map_copy (old_id uuid, map_id uuid, new_id uuid, PRIMARY KEY (old_id, map_id));
        INSERT INTO tag_map_copy SELECT t.id, m.id, gen_random_uuid() FROM tags t CROSS JOIN poi_maps m;
        INSERT INTO tags (id, map_id, name)
        SELECT x.new_id, x.map_id, t.name FROM tag_map_copy x JOIN tags t ON t.id = x.old_id;
        UPDATE place_tags pt SET tag_id = x.new_id
        FROM places p, tag_map_copy x
        WHERE p.id = pt.place_id AND x.old_id = pt.tag_id AND x.map_id = p.map_id;
        DELETE FROM tags WHERE map_id IS NULL;
    """))
    op.alter_column("categories", "map_id", nullable=False)
    op.alter_column("tags", "map_id", nullable=False)
    op.create_foreign_key("categories_map_id_fkey", "categories", "poi_maps", ["map_id"], ["id"], ondelete="CASCADE")
    op.create_foreign_key("tags_map_id_fkey", "tags", "poi_maps", ["map_id"], ["id"], ondelete="CASCADE")
    op.create_index("categories_map_name_key", "categories", ["map_id", sa.text("lower(btrim(name))")], unique=True)
    op.create_index("tags_map_name_key", "tags", ["map_id", sa.text("lower(btrim(name))")], unique=True)
    connection.execute(sa.text("""
        CREATE FUNCTION enforce_place_category_same_map() RETURNS trigger AS $$
        BEGIN
          IF (SELECT map_id FROM places WHERE id = NEW.place_id) IS DISTINCT FROM (SELECT map_id FROM categories WHERE id = NEW.category_id) THEN
            RAISE EXCEPTION 'place and category must belong to the same map' USING ERRCODE = '23514';
          END IF;
          RETURN NEW;
        END; $$ LANGUAGE plpgsql;
        CREATE TRIGGER place_categories_same_map BEFORE INSERT OR UPDATE ON place_categories FOR EACH ROW EXECUTE FUNCTION enforce_place_category_same_map();
        CREATE FUNCTION enforce_place_tag_same_map() RETURNS trigger AS $$
        BEGIN
          IF (SELECT map_id FROM places WHERE id = NEW.place_id) IS DISTINCT FROM (SELECT map_id FROM tags WHERE id = NEW.tag_id) THEN
            RAISE EXCEPTION 'place and tag must belong to the same map' USING ERRCODE = '23514';
          END IF;
          RETURN NEW;
        END; $$ LANGUAGE plpgsql;
        CREATE TRIGGER place_tags_same_map BEFORE INSERT OR UPDATE ON place_tags FOR EACH ROW EXECUTE FUNCTION enforce_place_tag_same_map();
    """))


def downgrade() -> None:
    connection = op.get_bind()
    connection.execute(sa.text("""
        DROP TRIGGER IF EXISTS place_tags_same_map ON place_tags;
        DROP FUNCTION IF EXISTS enforce_place_tag_same_map();
        DROP TRIGGER IF EXISTS place_categories_same_map ON place_categories;
        DROP FUNCTION IF EXISTS enforce_place_category_same_map();
        CREATE TEMP TABLE canonical_categories AS SELECT lower(btrim(name)) AS key, min(id::text)::uuid AS id FROM categories GROUP BY lower(btrim(name));
        UPDATE place_categories pc SET category_id = c.id FROM categories source, canonical_categories c WHERE pc.category_id = source.id AND c.key = lower(btrim(source.name)) AND pc.category_id <> c.id;
        DELETE FROM categories source USING canonical_categories c WHERE lower(btrim(source.name)) = c.key AND source.id <> c.id;
        CREATE TEMP TABLE canonical_tags AS SELECT lower(btrim(name)) AS key, min(id::text)::uuid AS id FROM tags GROUP BY lower(btrim(name));
        UPDATE place_tags pt SET tag_id = c.id FROM tags source, canonical_tags c WHERE pt.tag_id = source.id AND c.key = lower(btrim(source.name)) AND pt.tag_id <> c.id;
        DELETE FROM tags source USING canonical_tags c WHERE lower(btrim(source.name)) = c.key AND source.id <> c.id;
    """))
    op.drop_index("tags_map_name_key", table_name="tags")
    op.drop_index("categories_map_name_key", table_name="categories")
    op.drop_constraint("tags_map_id_fkey", "tags", type_="foreignkey")
    op.drop_constraint("categories_map_id_fkey", "categories", type_="foreignkey")
    op.drop_column("tags", "map_id")
    op.drop_column("categories", "map_id")
    op.create_unique_constraint("tags_name_key", "tags", ["name"])
    op.drop_table("map_invitations")
    op.drop_table("map_memberships")
    op.drop_constraint("poi_maps_owner_id_fkey", "poi_maps", type_="foreignkey")
    op.drop_column("poi_maps", "is_private")
    op.drop_column("poi_maps", "owner_id")
    op.create_unique_constraint("poi_maps_country_id_key", "poi_maps", ["country_id"])
    op.drop_table("user_sessions")
    op.drop_index("ix_users_email", table_name="users")
    op.drop_table("users")
