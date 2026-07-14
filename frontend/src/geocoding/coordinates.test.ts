import { describe, expect, it } from 'vitest'
import { formatCoordinates, isValidLatitude, isValidLongitude, parseCoordinates } from './coordinates'

describe('coordinate parsing', () => {
  it('accepts comma, whitespace and French decimal input', () => {
    expect(parseCoordinates('48.8566, 2.3522')).toEqual({ latitude: 48.8566, longitude: 2.3522 })
    expect(parseCoordinates('48.8566 2.3522')).toEqual({ latitude: 48.8566, longitude: 2.3522 })
    expect(parseCoordinates('48,8566 ; 2,3522')).toEqual({ latitude: 48.8566, longitude: 2.3522 })
  })
  it('rejects invalid, non-finite and incomplete input', () => {
    expect(parseCoordinates('91, 2')).toBeNull(); expect(parseCoordinates('48')).toBeNull(); expect(parseCoordinates('NaN, 2')).toBeNull()
    expect(isValidLatitude(Infinity)).toBe(false); expect(isValidLongitude(-181)).toBe(false)
  })
  it('formats coordinates consistently', () => expect(formatCoordinates(48.1, 2.2)).toBe('48.100000, 2.200000'))
})
