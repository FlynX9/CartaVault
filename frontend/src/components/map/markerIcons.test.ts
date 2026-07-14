import { describe, expect, it } from 'vitest'

import { getStatusMarkerIcon } from './markerIcons'

describe('status marker icons', () => {
  it('uses the API color and keeps selection as a separate visual state', () => {
    const regular = getStatusMarkerIcon('#D97706', 'factory', false)
    const selected = getStatusMarkerIcon('#D97706', 'factory', true)
    expect(regular.options.html).toContain('--marker-color:#D97706')
    expect(regular.options.html).toContain('<svg')
    expect(regular.options.html).toContain('status-marker-glyph')
    expect(regular.options.html).not.toContain('selected')
    expect(selected.options.html).toContain('status-marker selected')
    expect(selected.options.html).toContain('--marker-color:#D97706')
  })

  it('renders the closed fallback SVG without inserting an unknown identifier', () => {
    const fallback = getStatusMarkerIcon('#D97706', 'untrusted-url', false)
    expect(fallback.options.html).toContain('circle cx="12" cy="12"')
    expect(fallback.options.html).not.toContain('untrusted-url')
  })
})
