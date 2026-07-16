"""enforce map ownership after administrator bootstrap

Revision ID: e5b9c3d1a742
Revises: d8f4a2c7e910
"""

from alembic import op
import sqlalchemy as sa

revision = "e5b9c3d1a742"
down_revision = "d8f4a2c7e910"
branch_labels = None
depends_on = None


def upgrade() -> None:
    connection = op.get_bind()
    if not connection.scalar(sa.text("SELECT EXISTS (SELECT 1 FROM users WHERE is_admin AND is_active)")):
        raise RuntimeError("Create an active administrator with 'python -m app.cli create-admin' before applying this revision")
    if connection.scalar(sa.text("SELECT count(*) FROM poi_maps WHERE owner_id IS NULL")):
        raise RuntimeError("Backfill every map owner with 'python -m app.cli create-admin' before applying this revision")
    if connection.scalar(sa.text("SELECT count(*) FROM poi_maps m LEFT JOIN map_memberships mm ON mm.map_id=m.id AND mm.user_id=m.owner_id AND mm.role='owner' WHERE mm.id IS NULL")):
        raise RuntimeError("Every map owner must have one owner membership")
    op.alter_column("poi_maps", "owner_id", nullable=False)
    op.create_unique_constraint("poi_maps_owner_country_key", "poi_maps", ["owner_id", "country_id"])
    connection.execute(sa.text("""
        CREATE FUNCTION enforce_map_owner_membership() RETURNS trigger AS $$
        DECLARE checked_map_id uuid;
        BEGIN
          IF TG_TABLE_NAME = 'poi_maps' THEN
            checked_map_id := NEW.id;
          ELSIF TG_OP = 'DELETE' THEN
            checked_map_id := OLD.map_id;
          ELSE
            checked_map_id := NEW.map_id;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM poi_maps WHERE id = checked_map_id) THEN
            IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
          END IF;
          IF NOT EXISTS (
            SELECT 1 FROM poi_maps m
            JOIN map_memberships mm ON mm.map_id = m.id AND mm.user_id = m.owner_id AND mm.role = 'owner'
            WHERE m.id = checked_map_id
          ) OR (SELECT count(*) FROM map_memberships WHERE map_id = checked_map_id AND role = 'owner') <> 1 THEN
            RAISE EXCEPTION 'map owner_id and owner membership must match' USING ERRCODE = '23514';
          END IF;
          IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
        END; $$ LANGUAGE plpgsql;
        CREATE CONSTRAINT TRIGGER poi_maps_owner_membership_consistency
          AFTER INSERT OR UPDATE OF owner_id ON poi_maps
          DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
          EXECUTE FUNCTION enforce_map_owner_membership();
        CREATE CONSTRAINT TRIGGER map_memberships_owner_consistency
          AFTER INSERT OR UPDATE OR DELETE ON map_memberships
          DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
          EXECUTE FUNCTION enforce_map_owner_membership();
    """))


def downgrade() -> None:
    connection = op.get_bind()
    connection.execute(sa.text("""
        DROP TRIGGER IF EXISTS map_memberships_owner_consistency ON map_memberships;
        DROP TRIGGER IF EXISTS poi_maps_owner_membership_consistency ON poi_maps;
        DROP FUNCTION IF EXISTS enforce_map_owner_membership();
    """))
    op.drop_constraint("poi_maps_owner_country_key", "poi_maps", type_="unique")
    op.alter_column("poi_maps", "owner_id", nullable=True)
