from __future__ import annotations

from math import inf

from app.trips.routing.base import RoutingError


def path_cost(order: list[int], matrix: list[list[float | None]], return_to_start: bool = False) -> float:
    pairs = list(zip(order, order[1:])) + ([(order[-1], order[0])] if return_to_start and len(order) > 1 else [])
    total = 0.0
    for source, target in pairs:
        value = matrix[source][target]
        if value is None: return inf
        total += value
    return total


def optimize_matrix(matrix: list[list[float | None]], locked_positions: set[int] | None = None, keep_start: bool = True, keep_end: bool = True, return_to_start: bool = False) -> list[int]:
    size = len(matrix)
    if size < 3: return list(range(size))
    locked_positions = set(locked_positions or ())
    if keep_start: locked_positions.add(0)
    if keep_end and not return_to_start: locked_positions.add(size - 1)
    anchors = sorted(locked_positions)
    order = list(range(size))
    boundaries = [-1, *anchors, size]
    for left, right in zip(boundaries, boundaries[1:]):
        candidates = [index for index in range(left + 1, right) if index not in locked_positions]
        if not candidates: continue
        current = order[left] if left >= 0 else (order[anchors[0]] if anchors else candidates[0])
        arranged: list[int] = []
        remaining = set(candidates)
        while remaining:
            next_index = min(remaining, key=lambda index: matrix[current][index] if matrix[current][index] is not None else inf)
            if matrix[current][next_index] is None: raise RoutingError("Some stops cannot be connected")
            arranged.append(next_index); remaining.remove(next_index); current = next_index
        order[left + 1:right] = arranged
    improved = True
    while improved:
        improved = False
        baseline = path_cost(order, matrix, return_to_start)
        for start in range(1 if keep_start else 0, size - 1):
            for end in range(start + 1, size - (1 if keep_end and not return_to_start else 0)):
                if any(position in locked_positions for position in range(start, end + 1)): continue
                candidate = order[:start] + list(reversed(order[start:end + 1])) + order[end + 1:]
                value = path_cost(candidate, matrix, return_to_start)
                if value + 0.001 < baseline: order = candidate; baseline = value; improved = True
    return order
