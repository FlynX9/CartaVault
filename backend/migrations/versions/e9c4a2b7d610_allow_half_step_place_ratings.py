"""allow half-step place ratings

Revision ID: e9c4a2b7d610
Revises: d8b3f1a6c902
Create Date: 2026-07-23
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "e9c4a2b7d610"
down_revision: str | None = "d8b3f1a6c902"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.drop_constraint("places_interest_rating_range", "places", type_="check")
    op.drop_constraint("places_visit_rating_range", "places", type_="check")
    op.alter_column(
        "places",
        "interest_rating",
        existing_type=sa.SmallInteger(),
        type_=sa.Numeric(2, 1),
        postgresql_using="interest_rating::numeric(2, 1)",
    )
    op.alter_column(
        "places",
        "visit_rating",
        existing_type=sa.SmallInteger(),
        type_=sa.Numeric(2, 1),
        postgresql_using="visit_rating::numeric(2, 1)",
    )
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


def downgrade() -> None:
    op.drop_constraint("places_interest_rating_range", "places", type_="check")
    op.drop_constraint("places_visit_rating_range", "places", type_="check")
    op.alter_column(
        "places",
        "interest_rating",
        existing_type=sa.Numeric(2, 1),
        type_=sa.SmallInteger(),
        postgresql_using="round(interest_rating)::smallint",
    )
    op.alter_column(
        "places",
        "visit_rating",
        existing_type=sa.Numeric(2, 1),
        type_=sa.SmallInteger(),
        postgresql_using="round(visit_rating)::smallint",
    )
    op.create_check_constraint(
        "places_interest_rating_range",
        "places",
        "interest_rating IS NULL OR interest_rating BETWEEN 1 AND 5",
    )
    op.create_check_constraint(
        "places_visit_rating_range",
        "places",
        "visit_rating IS NULL OR visit_rating BETWEEN 1 AND 5",
    )
