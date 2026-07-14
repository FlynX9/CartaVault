import { describe, expect, it, vi } from 'vitest'

import { getCategoryIconData } from '../../icons/categoryIconData'
import { FALLBACK_CATEGORY_ICON_ID } from '../../icons/categoryIconCatalog'
import { getStatusMarkerIcon } from './markerIcons'

describe('status marker icons', () => {
  it('uses the API color and keeps selection as a separate visual state', () => {
    const regular = getStatusMarkerIcon('#D97706', 'mdi:factory', false)
    const selected = getStatusMarkerIcon('#D97706', 'mdi:factory', true)
    expect(regular.options.html).toContain('--marker-color:#D97706')
    expect(regular.options.html).toContain(getCategoryIconData('mdi:factory').body)
    expect(regular.options.html).not.toContain('status-marker selected')
    expect(selected.options.html).toContain('status-marker selected')
    expect(selected.options.html).toContain('--marker-color:#D97706')
  })

  it('uses the local MDI and Material Symbol bodies without a network request', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const church = getStatusMarkerIcon('#D97706', 'mdi:church', false)
    const materialSymbol = getStatusMarkerIcon('#D97706', 'material-symbols:location-on-outline', false)

    expect(church.options.html).toContain(getCategoryIconData('mdi:church').body)
    expect(church.options.html).not.toContain(getCategoryIconData(FALLBACK_CATEGORY_ICON_ID).body)
    expect(materialSymbol.options.html).toContain(getCategoryIconData('material-symbols:location-on-outline').body)
    expect(church.options.html).toContain('fill="currentColor"')
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('renders only the local fallback for unknown identifiers', () => {
    const fallback = getStatusMarkerIcon('#D97706', 'untrusted-url', false)

    expect(fallback.options.html).toContain(getCategoryIconData(FALLBACK_CATEGORY_ICON_ID).body)
    expect(fallback.options.html).not.toContain('untrusted-url')
  })
})
