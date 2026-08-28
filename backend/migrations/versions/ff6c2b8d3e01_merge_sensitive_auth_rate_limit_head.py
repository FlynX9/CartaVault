"""merge sensitive authentication rate-limit head

Revision ID: ff6c2b8d3e01
Revises: a6c9e3f1b742, fe5b1a7c2d90
"""

from collections.abc import Sequence


revision = "ff6c2b8d3e01"
down_revision: tuple[str, str] = ("a6c9e3f1b742", "fe5b1a7c2d90")
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Merge independent migration branches without changing schema."""


def downgrade() -> None:
    """Restore independent migration heads without changing schema."""
