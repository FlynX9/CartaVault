"""merge API key sharing and multiple maps heads

Revision ID: a6c9e3f1b742
Revises: f5b8d2a4c731, fd4e8a2b7c91
Create Date: 2026-08-27
"""

from collections.abc import Sequence


revision: str = "a6c9e3f1b742"
down_revision: tuple[str, str] = ("f5b8d2a4c731", "fd4e8a2b7c91")
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Merge independent migration branches without changing schema."""


def downgrade() -> None:
    """Restore independent migration heads without changing schema."""
