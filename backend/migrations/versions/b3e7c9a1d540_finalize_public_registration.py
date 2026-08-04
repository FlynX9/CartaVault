"""finalize public registration safeguards

Revision ID: b3e7c9a1d540
Revises: a2d8f4c6e310
Create Date: 2026-08-04
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "b3e7c9a1d540"
down_revision: str | None = "a2d8f4c6e310"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    op.drop_constraint("registration_requests_status_check", "registration_requests", type_="check")
    op.create_check_constraint(
        "registration_requests_status_check",
        "registration_requests",
        "status IN ('awaiting_email', 'pending', 'approved', 'rejected', 'expired')",
    )
    op.add_column("registration_requests", sa.Column("verification_token_hash", sa.String(64), nullable=True))
    op.add_column("registration_requests", sa.Column("verification_expires_at", sa.DateTime(), nullable=True))
    op.add_column("registration_requests", sa.Column("email_verified_at", sa.DateTime(), nullable=True))
    op.add_column("registration_requests", sa.Column("terms_accepted_at", sa.DateTime(), nullable=True))
    op.add_column("registration_requests", sa.Column("terms_version", sa.String(32), nullable=True))
    op.execute("UPDATE registration_requests SET terms_accepted_at = created_at, terms_version = 'legacy' WHERE terms_accepted_at IS NULL")
    op.alter_column("registration_requests", "terms_accepted_at", nullable=False, server_default=sa.func.now())
    op.alter_column("registration_requests", "terms_version", nullable=False, server_default=sa.text("'legacy'"))
    op.create_index("registration_requests_verification_token_hash_key", "registration_requests", ["verification_token_hash"], unique=True)

    if "auth_security_events" not in inspector.get_table_names():
        op.create_table(
            "auth_security_events",
            sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), nullable=False),
            sa.Column("event_type", sa.String(64), nullable=False),
            sa.Column("outcome", sa.String(32), nullable=False),
            sa.Column("actor_user_id", postgresql.UUID(as_uuid=True), nullable=True),
            sa.Column("registration_request_id", postgresql.UUID(as_uuid=True), nullable=True),
            sa.Column("target_email_hash", sa.String(64), nullable=True),
            sa.Column("client_ip_hash", sa.String(64), nullable=True),
            sa.Column("details", postgresql.JSONB(astext_type=sa.Text()), server_default=sa.text("'{}'::jsonb"), nullable=False),
            sa.Column("occurred_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
            sa.ForeignKeyConstraint(["actor_user_id"], ["users.id"], ondelete="SET NULL"),
            sa.ForeignKeyConstraint(["registration_request_id"], ["registration_requests.id"], ondelete="SET NULL"),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index("auth_security_events_occurred_at_idx", "auth_security_events", ["occurred_at"])
        op.create_index("auth_security_events_event_type_idx", "auth_security_events", ["event_type", "occurred_at"])


def downgrade() -> None:
    op.drop_index("auth_security_events_event_type_idx", table_name="auth_security_events")
    op.drop_index("auth_security_events_occurred_at_idx", table_name="auth_security_events")
    op.drop_table("auth_security_events")
    op.drop_index("registration_requests_verification_token_hash_key", table_name="registration_requests")
    op.drop_column("registration_requests", "terms_version")
    op.drop_column("registration_requests", "terms_accepted_at")
    op.drop_column("registration_requests", "email_verified_at")
    op.drop_column("registration_requests", "verification_expires_at")
    op.drop_column("registration_requests", "verification_token_hash")
    op.drop_constraint("registration_requests_status_check", "registration_requests", type_="check")
    op.create_check_constraint("registration_requests_status_check", "registration_requests", "status IN ('pending', 'approved', 'rejected')")
