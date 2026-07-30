import { describe, expect, it } from 'vitest'

import { DEFAULT_PLACE_FILTERS, buildPlaceFilterSearchParams, countActivePlaceFilters, deserializePlaceFilters, hasActivePlaceFilters, resetPlaceFilters, serializePlaceFilters } from './placeFilters'

describe('place filters', () => {
  it('normalizes, serializes and restores stable multi-value filters', () => {
    const value = { ...DEFAULT_PLACE_FILTERS, query: ' église ', categoryIds: ['b', 'a', 'a'], hasPhotos: true, createdFrom: '2026-01-01' }
    const params = serializePlaceFilters(value)
    expect(params.toString()).toContain('categories=a%2Cb')
    expect(deserializePlaceFilters(params)).toMatchObject({ query: 'église', categoryIds: ['a', 'b'], hasPhotos: true })
    expect([...buildPlaceFilterSearchParams(value).getAll('category_ids')]).toEqual(['a', 'b'])
  })

  it('drops invalid date ranges rather than issuing an invalid request', () => {
    expect(deserializePlaceFilters(new URLSearchParams('created_from=2026-05-01&created_to=2026-01-01')).createdTo).toBeNull()
  })

  it('round-trips favorites, visits, ratings and a stable sort', () => {
    const params = serializePlaceFilters({ ...DEFAULT_PLACE_FILTERS, isFavorite: true, functionalState: 'non_visited', ratingMin: 4, sortBy: 'relevant_rating', sortDirection: 'desc' })
    expect(params.toString()).toBe('favorite=true&visit_state=non_visited&rating_min=4&sort=relevant_rating&direction=desc')
    expect(deserializePlaceFilters(params)).toMatchObject({ isFavorite: true, functionalState: 'non_visited', ratingMin: 4, sortBy: 'relevant_rating', sortDirection: 'desc' })
    expect(buildPlaceFilterSearchParams(deserializePlaceFilters(params)).toString()).toContain('rating_min=4')
  })

  it('does not count sorting as a filter and preserves it when filters are reset', () => {
    const sorted = { ...DEFAULT_PLACE_FILTERS, sortBy: 'updated_at' as const, sortDirection: 'desc' as const }
    expect(countActivePlaceFilters(sorted)).toBe(0)
    expect(hasActivePlaceFilters(sorted)).toBe(false)

    const reset = resetPlaceFilters({ ...sorted, query: 'église', categoryIds: ['category-id'], isFavorite: true })
    expect(reset).toEqual({ ...DEFAULT_PLACE_FILTERS, sortBy: 'updated_at', sortDirection: 'desc' })
  })
})
