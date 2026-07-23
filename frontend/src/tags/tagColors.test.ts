import { describe, expect, it } from 'vitest'

import { DEFAULT_TAG_COLOR, getTagColorStyle, normalizeTagColor } from './tagColors'

describe('tag colors', () => {
  it('normalizes valid colors and falls back safely', () => {
    expect(normalizeTagColor('#abcdef')).toBe('#ABCDEF')
    expect(normalizeTagColor('javascript:alert(1)')).toBe(DEFAULT_TAG_COLOR)
  })

  it('keeps tag text readable on light and dark colors', () => {
    expect(getTagColorStyle('#F5D76E')).toMatchObject({ backgroundColor: '#F5D76E', color: '#0D1B2A' })
    expect(getTagColorStyle('#123456')).toMatchObject({ backgroundColor: '#123456', color: '#FFFFFF' })
  })
})
