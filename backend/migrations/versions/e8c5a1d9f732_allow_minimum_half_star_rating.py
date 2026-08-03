"""allow minimum half-star place ratings

Revision ID: e8c5a1d9f732
Revises: d7b4c9e1a620
Create Date: 2026-08-03
"""

from collections.abc import Sequence

from alembic import op


revision: str = "e8c5a1d9f732"
down_revision: str | None = "d7b4c9e1a620"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.drop_constraint("places_interest_rating_range", "places", type_="check")
    op.drop_constraint("places_visit_rating_range", "places", type_="check")
    op.create_check_constraint(
        "places_interest_rating_range",
        "places",
        "interest_rating IS NULL OR (interest_rating BETWEEN 0.5 AND 5 AND interest_rating * 2 = trunc(interest_rating * 2))",
    )
    op.create_check_constraint(
        "places_visit_rating_range",
        "places",
        "visit_rating IS NULL OR (visit_rating BETWEEN 0.5 AND 5 AND visit_rating * 2 = trunc(visit_rating * 2))",
    )


def downgrade() -> None:
    op.drop_constraint("places_interest_rating_range", "places", type_="check")
    op.drop_constraint("places_visit_rating_range", "places", type_="check")
    op.execute("UPDATE places SET interest_rating = 1 WHERE interest_rating < 1")
    op.execute("UPDATE places SET visit_rating = 1 WHERE visit_rating < 1")
    op.create_check_constraint(
        "places_interest_rating_range",
        "places",
        "interest_rating IS NULL OR (interest_rating BETWEEN 1 AND 5 AND interest_rating * 2 = trunc(interest_rating * 2))",
    )
    op.create_check_constraint(
        "places_visit_rating_range",
        "places",
        "visit_rating IS NULL OR (visit_rating BETWEEN 1 AND 5 AND visit_rating * 2 = trunc(visit_rating * 2))",
    )
