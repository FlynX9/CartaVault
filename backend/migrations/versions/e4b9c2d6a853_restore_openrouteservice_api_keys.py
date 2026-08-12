"""restore OpenRouteService API keys

Revision ID: e4b9c2d6a853
Revises: d3a8f1c5b742
"""

from alembic import op
import sqlalchemy as sa


revision = "e4b9c2d6a853"
down_revision = "d3a8f1c5b742"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_constraint("user_api_credentials_provider_check", "user_api_credentials", type_="check")
    op.create_check_constraint(
        "user_api_credentials_provider_check",
        "user_api_credentials",
        "provider IN ('google', 'stadia', 'openrouteservice')",
    )
    op.drop_constraint("admin_api_credentials_provider_check", "admin_api_credentials", type_="check")
    op.create_check_constraint(
        "admin_api_credentials_provider_check",
        "admin_api_credentials",
        "provider IN ('google', 'stadia', 'openrouteservice', 'resend')",
    )

    # The catalogue migration temporarily relabelled legacy ORS credentials as
    # Google keys. Its generated name lets us restore them without touching
    # genuine Google credentials.
    op.execute(sa.text("""
        UPDATE user_api_credentials
        SET provider = 'openrouteservice', name = 'OpenRouteService — clé existante'
        WHERE provider = 'google' AND name = 'Clé existante'
    """))
    op.execute(sa.text("""
        UPDATE users AS u
        SET preferences = jsonb_set(
            jsonb_set(
                COALESCE(u.preferences, '{}'::jsonb),
                '{routing}',
                COALESCE(u.preferences -> 'routing', '{}'::jsonb),
                true
            ),
            '{routing,provider}',
            '"openrouteservice"'::jsonb,
            true
        )
        FROM user_api_credentials AS c
        WHERE c.user_id = u.id
          AND c.provider = 'openrouteservice'
          AND c.name = 'OpenRouteService — clé existante'
    """))
    op.execute(sa.text("""
        UPDATE users AS u
        SET preferences = jsonb_set(
            u.preferences,
            '{routing,api_key_id}',
            to_jsonb(c.id::text),
            true
        )
        FROM user_api_credentials AS c
        WHERE c.user_id = u.id
          AND c.provider = 'openrouteservice'
          AND c.name = 'OpenRouteService — clé existante'
    """))


def downgrade() -> None:
    op.execute(sa.text("""
        UPDATE users
        SET preferences = jsonb_set(
            jsonb_set(COALESCE(preferences, '{}'::jsonb), '{routing,provider}', '"osrm"'::jsonb, true),
            '{routing,api_key_id}',
            'null'::jsonb,
            true
        )
        WHERE preferences #>> '{routing,provider}' = 'openrouteservice'
    """))
    op.execute(sa.text("""
        UPDATE user_api_credentials
        SET provider = 'google', name = 'Clé existante'
        WHERE provider = 'openrouteservice'
    """))
    op.execute(sa.text("""
        UPDATE admin_api_credentials
        SET provider = 'google', name = name || ' (OpenRouteService)'
        WHERE provider = 'openrouteservice'
    """))

    op.drop_constraint("admin_api_credentials_provider_check", "admin_api_credentials", type_="check")
    op.create_check_constraint(
        "admin_api_credentials_provider_check",
        "admin_api_credentials",
        "provider IN ('google', 'stadia', 'resend')",
    )
    op.drop_constraint("user_api_credentials_provider_check", "user_api_credentials", type_="check")
    op.create_check_constraint(
        "user_api_credentials_provider_check",
        "user_api_credentials",
        "provider IN ('google', 'stadia')",
    )
