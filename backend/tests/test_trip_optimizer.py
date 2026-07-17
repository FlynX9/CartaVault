import pytest

from app.trips.optimizer import optimize_matrix, path_cost

pytestmark = pytest.mark.unit


def test_optimizer_keeps_endpoints_and_locked_positions_and_improves_path() -> None:
    matrix = [
        [0, 10, 1, 20, 30],
        [10, 0, 10, 1, 20],
        [1, 10, 0, 10, 20],
        [20, 1, 10, 0, 1],
        [30, 20, 20, 1, 0],
    ]
    order = optimize_matrix(matrix, locked_positions={2}, keep_start=True, keep_end=True)
    assert order[0] == 0 and order[-1] == 4
    assert order[2] == 2
    assert path_cost(order, matrix) <= path_cost(list(range(5)), matrix)


def test_optimizer_reports_unreachable_candidates() -> None:
    matrix = [[0, None, None], [None, 0, 1], [None, 1, 0]]
    with pytest.raises(Exception, match="cannot be connected"):
        optimize_matrix(matrix, keep_start=True, keep_end=True)
