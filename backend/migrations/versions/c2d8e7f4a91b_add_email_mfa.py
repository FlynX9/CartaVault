"""add email MFA state and one-time codes

Revision ID: c2d8e7f4a91b
Revises: fa1e7c2d4b90
"""

from alembic import op
import sqlalchemy as sa

revision = "c2d8e7f4a91b"
down_revision = "fa1e7c2d4b90"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("email_mfa_enabled", sa.Boolean(), nullable=False, server_default=sa.text("false")))
    op.add_column("users", sa.Column("email_mfa_verified_at", sa.DateTime(), nullable=True))
    op.create_table("email_mfa_codes",
        sa.Column("id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), primary_key=True),
        sa.Column("user_id", sa.UUID(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("purpose", sa.String(length=32), nullable=False),
        sa.Column("challenge_token_hash", sa.String(length=64), nullable=False),
        sa.Column("code_hash", sa.String(length=64), nullable=False),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("attempts", sa.SmallInteger(), nullable=False, server_default=sa.text("0")),
        sa.Column("used_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("email_mfa_codes_challenge_idx", "email_mfa_codes", ["challenge_token_hash"], unique=True)
    op.create_index("email_mfa_codes_user_purpose_idx", "email_mfa_codes", ["user_id", "purpose", "created_at"])
    op.drop_constraint("auth_action_tokens_type_check", "auth_action_tokens", type_="check")
    op.create_check_constraint("auth_action_tokens_type_check", "auth_action_tokens", "token_type IN ('password_reset', 'totp_login', 'email_mfa_login', 'email_mfa_enable')")


def downgrade() -> None:
    op.drop_constraint("auth_action_tokens_type_check", "auth_action_tokens", type_="check")
    op.create_check_constraint("auth_action_tokens_type_check", "auth_action_tokens", "token_type IN ('password_reset', 'totp_login')")
    op.drop_index("email_mfa_codes_user_purpose_idx", table_name="email_mfa_codes")
    op.drop_index("email_mfa_codes_challenge_idx", table_name="email_mfa_codes")
    op.drop_table("email_mfa_codes")
    op.drop_column("users", "email_mfa_verified_at")
    op.drop_column("users", "email_mfa_enabled")
