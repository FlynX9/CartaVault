from uuid import UUID

from sqlalchemy.orm import Session

from app.statuses.models import PlaceStatus, StatusFunctionalState


DEFAULT_STATUS_DEFINITIONS = (
    ("À faire", "a-faire", "#2563EB", StatusFunctionalState.NON_VISITED, 10, True),
    ("À vérifier", "a-verifier", "#D97706", StatusFunctionalState.NON_VISITED, 20, False),
    ("Visité", "visite", "#16A34A", StatusFunctionalState.VISITED, 30, False),
    ("À refaire", "a-refaire", "#7C3AED", StatusFunctionalState.VISITED, 40, False),
)


def create_default_statuses(database_session: Session, map_id: UUID) -> list[PlaceStatus]:
    """Create the stable default status catalog for a newly-created map."""

    statuses = [
        PlaceStatus(
            map_id=map_id,
            name=name,
            slug=slug,
            color=color,
            functional_state=functional_state.value,
            sort_order=sort_order,
            is_default=is_default,
            is_active=True,
        )
        for name, slug, color, functional_state, sort_order, is_default in DEFAULT_STATUS_DEFINITIONS
    ]
    database_session.add_all(statuses)
    return statuses
