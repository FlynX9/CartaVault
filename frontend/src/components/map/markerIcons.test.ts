import { describe, expect, it } from 'vitest'

import { getStatusMarkerIcon } from './markerIcons'

describe('status marker icons', () => {
  it('uses the API color and keeps selection as a separate visual state', () => {
    const regular = getStatusMarkerIcon('#D97706', false)
    const selected = getStatusMarkerIcon('#D97706', true)
    expect(regular.options.html).toContain('--marker-color:#D97706')
    expect(regular.options.html).not.toContain('selected')
    expect(selected.options.html).toContain('status-marker selected')
    expect(selected.options.html).toContain('--marker-color:#D97706')
  })
})
