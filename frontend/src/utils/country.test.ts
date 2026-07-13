import { describe, expect, it } from 'vitest'

import { includeActiveCountry, readCountry, withCountry } from './country'

describe('country URL state', () => {
  it('reads and writes an encoded country query', () => {
    expect(readCountry('?country=C%C3%B4te+d%27Ivoire')).toBe("Côte d'Ivoire")
    expect(withCountry('/places/123', "Côte d'Ivoire")).toBe(
      "/places/123?country=C%C3%B4te+d%27Ivoire",
    )
    expect(withCountry('/', null)).toBe('/')
  })

  it('keeps an URL country available without case-sensitive duplicates', () => {
    expect(includeActiveCountry(['france', 'Belgique'], 'France')).toEqual([
      'Belgique',
      'France',
    ])
  })
})
