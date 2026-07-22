"""scope place statuses to maps and add functional state

Revision ID: d6f1a3b8c902
Revises: a4f9c2e7d631
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "d6f1a3b8c902"
down_revision = "a4f9c2e7d631"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("place_statuses", sa.Column("map_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.add_column("place_statuses", sa.Column("functional_state", sa.String(16), nullable=True))

    # This name/slug mapping is intentionally migration-only. Unknown legacy
    # values are classified conservatively as non_visited; application code
    # must only use the persisted functional_state afterwards.
    op.execute(
        """
        UPDATE place_statuses
        SET functional_state = CASE
            WHEN slug IN ('visite', 'fait', 'a-refaire', 'inaccessible') THEN 'visited'
            ELSE 'non_visited'
        END
        """
    )

    op.drop_index("place_statuses_one_default_idx", table_name="place_statuses")
    op.drop_constraint("place_statuses_slug_key", "place_statuses", type_="unique")

    op.execute(
        """
        CREATE TEMPORARY TABLE status_map_migration (
            map_id uuid NOT NULL,
            old_status_id uuid NOT NULL,
            new_status_id uuid NOT NULL DEFAULT gen_random_uuid(),
            PRIMARY KEY (map_id, old_status_id)
        ) ON COMMIT DROP
        """
    )
    op.execute(
        """
        INSERT INTO status_map_migration (map_id, old_status_id)
        SELECT maps.id, statuses.id
        FROM poi_maps AS maps
        CROSS JOIN place_statuses AS statuses
        WHERE statuses.map_id IS NULL
        """
    )
    op.execute(
        """
        INSERT INTO place_statuses (
            id, map_id, name, slug, functional_state, color, sort_order,
            is_default, is_active, created_at, updated_at
        )
        SELECT migration.new_status_id, migration.map_id, statuses.name, statuses.slug,
               statuses.functional_state, statuses.color, statuses.sort_order,
               statuses.is_default, statuses.is_active, statuses.created_at, statuses.updated_at
        FROM status_map_migration AS migration
        JOIN place_statuses AS statuses ON statuses.id = migration.old_status_id
        """
    )
    op.execute(
        """
        UPDATE places
        SET status_id = migration.new_status_id
        FROM status_map_migration AS migration
        WHERE places.map_id = migration.map_id
          AND places.status_id = migration.old_status_id
        """
    )
    op.execute("DELETE FROM place_statuses WHERE map_id IS NULL")

    connection = op.get_bind()
    if connection.scalar(sa.text("SELECT count(*) FROM place_statuses WHERE map_id IS NULL OR functional_state IS NULL")):
        raise RuntimeError("Unable to backfill map-scoped place statuses")
    if connection.scalar(
        sa.text(
            """
            SELECT count(*) FROM places AS p
            JOIN place_statuses AS s ON s.id = p.status_id
            WHERE p.map_id <> s.map_id
            """
        )
    ):
        raise RuntimeError("A place status was assigned to the wrong map")

    op.alter_column("place_statuses", "map_id", nullable=False)
    op.alter_column("place_statuses", "functional_state", nullable=False)
    op.create_foreign_key(
        "place_statuses_map_id_fkey",
        "place_statuses",
        "poi_maps",
        ["map_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_check_constraint(
        "place_statuses_functional_state_check",
        "place_statuses",
        "functional_state IN ('non_visited', 'visited')",
    )
    op.create_index("place_statuses_map_slug_key", "place_statuses", ["map_id", "slug"], unique=True)
    op.create_index(
        "place_statuses_one_default_idx",
        "place_statuses",
        ["map_id"],
        unique=True,
        postgresql_where=sa.text("is_default"),
    )
    op.create_index(
        "place_statuses_map_functional_state_idx",
        "place_statuses",
        ["map_id", "functional_state"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("place_statuses_map_functional_state_idx", table_name="place_statuses")
    op.drop_index("place_statuses_one_default_idx", table_name="place_statuses")
    op.drop_index("place_statuses_map_slug_key", table_name="place_statuses")
    op.drop_constraint("place_statuses_functional_state_check", "place_statuses", type_="check")
    op.drop_constraint("place_statuses_map_id_fkey", "place_statuses", type_="foreignkey")

    op.execute(
        """
        WITH ranked AS (
            SELECT id, row_number() OVER (PARTITION BY slug ORDER BY map_id, id) AS position
            FROM place_statuses
        )
        UPDATE place_statuses AS statuses
        SET slug = left(statuses.slug, 62) || '-' || replace(statuses.map_id::text, '-', '')
        FROM ranked
        WHERE statuses.id = ranked.id AND ranked.position > 1
        """
    )
    op.execute(
        """
        WITH defaults AS (
            SELECT id, row_number() OVER (ORDER BY map_id, sort_order, id) AS position
            FROM place_statuses WHERE is_default
        )
        UPDATE place_statuses AS statuses
        SET is_default = false
        FROM defaults
        WHERE statuses.id = defaults.id AND defaults.position > 1
        """
    )

    op.create_unique_constraint("place_statuses_slug_key", "place_statuses", ["slug"])
    op.create_index(
        "place_statuses_one_default_idx",
        "place_statuses",
        ["is_default"],
        unique=True,
        postgresql_where=sa.text("is_default"),
    )
    op.drop_column("place_statuses", "functional_state")
    op.drop_column("place_statuses", "map_id")
