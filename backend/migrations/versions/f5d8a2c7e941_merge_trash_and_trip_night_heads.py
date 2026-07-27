"""merge trash and trip night source heads

Revision ID: f5d8a2c7e941
Revises: f2a6c8d4e915, f4c7e1a9b630
Create Date: 2026-07-27
"""

from collections.abc import Sequence


revision: str = "f5d8a2c7e941"
down_revision: tuple[str, str] = ("f2a6c8d4e915", "f4c7e1a9b630")
branch_labels: str | Sequence[str] | None = None
depends_on: str | None = None


def upgrade() -> None:
    """Merge independent migration branches without changing schema."""


def downgrade() -> None:
    """Restore independent migration heads without changing schema."""
