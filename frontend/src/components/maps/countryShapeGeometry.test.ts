import { describe, expect, it } from 'vitest'

import { getCountryShapeSource, normalizeCountryShape } from './countryShapeGeometry'

describe('country shape geometry', () => {
  it('keeps only continental metropolitan France', () => {
    const shape = normalizeCountryShape('FRA')
    expect(shape).toMatchObject({ mode: 'mainland', partCount: 1, sourcePartCount: 3, viewBox: '0 0 400 300' })
    expect(shape?.path).toContain('M')
    expect(getCountryShapeSource('FRA')).toBe('Natural Earth 1:110m')
  })

  it('keeps the Italian peninsula, Sicily, and Sardinia', () => {
    const shape = normalizeCountryShape('ITA')
    expect(shape).toMatchObject({ mode: 'multi-landmass', partCount: 3, sourcePartCount: 3 })
    expect(shape?.path.match(/M/g)).toHaveLength(3)
  })

  it('keeps a compact readable Åland archipelago without every micro-island', () => {
    const shape = normalizeCountryShape('ALA')
    expect(shape?.mode).toBe('archipelago')
    expect(shape?.partCount).toBeGreaterThan(1)
    expect(shape?.partCount).toBeLessThan(shape?.sourcePartCount ?? 0)
    expect(shape?.bounds.minX).toBeGreaterThanOrEqual(400 * 0.08 - 0.01)
    expect(shape?.bounds.maxX).toBeLessThanOrEqual(400 * 0.92 + 0.01)
  })

  it.each(['BEL', 'GEO'])('normalizes horizontal mainland geometry for %s inside the fixed safe area', (code) => {
    const shape = normalizeCountryShape(code)
    expect(shape).toMatchObject({ mode: 'mainland', partCount: 1, viewBox: '0 0 400 300' })
    expect(shape?.path.length).toBeGreaterThan(20)
    expect(shape?.bounds.minY).toBeGreaterThanOrEqual(300 * 0.09 - 0.01)
    expect(shape?.bounds.maxY).toBeLessThanOrEqual(300 * 0.91 + 0.01)
  })

  it('memoizes normalized static shapes', () => {
    expect(normalizeCountryShape('FRA')).toBe(normalizeCountryShape('FRA'))
  })
})
