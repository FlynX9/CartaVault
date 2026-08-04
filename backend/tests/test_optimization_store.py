from uuid import uuid4

from app.trips.optimization_store import OptimizationProposalStore


def test_memory_optimization_proposal_is_single_use() -> None:
    store = OptimizationProposalStore(ttl_seconds=60)
    proposal_id = store.create({"trip_id": "trip", "days": [{"day_id": "day"}]})

    assert store.take(proposal_id) == {"trip_id": "trip", "days": [{"day_id": "day"}]}
    assert store.take(proposal_id) is None


def test_optimization_proposal_can_be_restored_after_failed_transaction() -> None:
    store = OptimizationProposalStore(ttl_seconds=60)
    proposal_id = uuid4()
    payload = {"trip_id": "trip", "days": []}

    store.restore(proposal_id, payload)
    consumed = store.take(proposal_id)
    store.restore(proposal_id, consumed)

    assert store.take(proposal_id) == payload
