"""add TOTP two-factor authentication

Revision ID: a4e8b2c6d913
Revises: a3d7b2c9e841
"""

from alembic import op
import sqlalchemy as sa


revision = "a4e8b2c6d913"
down_revision = "a3d7b2c9e841"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("totp_enabled", sa.Boolean(), nullable=False, server_default=sa.text("false")))
    op.add_column("users", sa.Column("totp_secret_encrypted", sa.Text(), nullable=True))
    op.add_column("users", sa.Column("totp_encryption_version", sa.SmallInteger(), nullable=True))
    op.add_column("users", sa.Column("totp_verified_at", sa.DateTime(), nullable=True))
    op.add_column("users", sa.Column("totp_enrollment_expires_at", sa.DateTime(), nullable=True))
    op.add_column("users", sa.Column("totp_last_used_counter", sa.BigInteger(), nullable=True))
    op.create_table(
        "totp_recovery_codes",
        sa.Column("id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("code_hash", sa.String(length=64), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("used_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("code_hash", name="totp_recovery_codes_code_hash_key"),
    )
    op.create_index("totp_recovery_codes_user_id_idx", "totp_recovery_codes", ["user_id"])
    op.drop_constraint("auth_action_tokens_type_check", "auth_action_tokens", type_="check")
    op.create_check_constraint("auth_action_tokens_type_check", "auth_action_tokens", "token_type IN ('password_reset', 'totp_login')")


def downgrade() -> None:
    op.drop_constraint("auth_action_tokens_type_check", "auth_action_tokens", type_="check")
    op.create_check_constraint("auth_action_tokens_type_check", "auth_action_tokens", "token_type IN ('password_reset')")
    op.drop_index("totp_recovery_codes_user_id_idx", table_name="totp_recovery_codes")
    op.drop_table("totp_recovery_codes")
    for column in ("totp_last_used_counter", "totp_enrollment_expires_at", "totp_verified_at", "totp_encryption_version", "totp_secret_encrypted", "totp_enabled"):
        op.drop_column("users", column)
