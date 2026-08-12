"""unify personal API keys and assignments

Revision ID: b1e4c8d2f690
Revises: a1d8f4e2c6b0
"""

from alembic import op
import sqlalchemy as sa


revision = "b1e4c8d2f690"
down_revision = "a1d8f4e2c6b0"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("user_api_credentials", sa.Column("name", sa.String(length=120), nullable=True))
    op.drop_constraint("user_api_credentials_user_provider_key", "user_api_credentials", type_="unique")
    op.drop_constraint("user_api_credentials_provider_check", "user_api_credentials", type_="check")

    # Preserve every old key and bind its previous usage to the new preference
    # slot before converting the provider to the reusable Google/Stadia type.
    bindings = (
        ("google_routes", "Google Routes — clé existante", "routing", "google"),
        ("google_places", "Google Places — clé existante", "places", "google"),
        ("google_map_tiles", "Google Map Tiles — clé existante", "basemaps", "google"),
        ("stadia_places", "Stadia Places — clé existante", "places", "stadia"),
        ("stadia_maps", "Stadia Maps — clé existante", "basemaps", "stadia"),
    )
    for legacy_provider, title, area, provider in bindings:
        op.execute(sa.text(f"""
            UPDATE users AS u
            SET preferences = jsonb_set(
                COALESCE(u.preferences, '{{}}'::jsonb),
                ARRAY['{area}', 'api_key_id'],
                to_jsonb(c.id::text),
                true
            )
            FROM user_api_credentials AS c
            WHERE c.user_id = u.id AND c.provider = '{legacy_provider}'
        """))
        op.execute(sa.text("UPDATE user_api_credentials SET name = :title, provider = :provider WHERE provider = :legacy").bindparams(title=title, provider=provider, legacy=legacy_provider))

    # OpenRouteService is not part of the initial reusable-key catalogue. Keep
    # the encrypted material as a Google-labelled legacy key rather than lose it.
    op.execute(sa.text("UPDATE user_api_credentials SET name = 'Clé existante', provider = 'google' WHERE provider = 'openrouteservice'"))
    op.execute(sa.text("""
        UPDATE users
        SET preferences = jsonb_set(COALESCE(preferences, '{}'::jsonb), ARRAY['routing', 'provider'], '"osrm"'::jsonb, true)
        WHERE preferences #>> ARRAY['routing', 'provider'] = 'openrouteservice'
    """))
    op.create_check_constraint("user_api_credentials_provider_check", "user_api_credentials", "provider IN ('google', 'stadia')")
    op.execute(sa.text("UPDATE user_api_credentials SET name = 'Clé API' WHERE name IS NULL OR btrim(name) = ''"))
    op.alter_column("user_api_credentials", "name", nullable=False)


def downgrade() -> None:
    op.drop_constraint("user_api_credentials_provider_check", "user_api_credentials", type_="check")
    op.create_check_constraint("user_api_credentials_provider_check", "user_api_credentials", "provider IN ('google_routes', 'google_places', 'openrouteservice', 'google_map_tiles', 'stadia_maps', 'stadia_places')")
    op.create_unique_constraint("user_api_credentials_user_provider_key", "user_api_credentials", ["user_id", "provider"])
    op.drop_column("user_api_credentials", "name")
