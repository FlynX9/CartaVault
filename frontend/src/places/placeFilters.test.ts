import { describe, expect, it } from 'vitest'

import { DEFAULT_PLACE_FILTERS, buildPlaceFilterSearchParams, deserializePlaceFilters, serializePlaceFilters } from './placeFilters'

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
})
