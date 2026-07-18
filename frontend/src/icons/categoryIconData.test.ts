import { describe, expect, it, vi } from 'vitest'

import { CATEGORY_ICON_CATALOG, DEFAULT_CATEGORY_ICON_ID, FALLBACK_CATEGORY_ICON_ID } from './categoryIconCatalog'
import { CATEGORY_ICON_DATA } from './categoryIconData.generated'
import { getCategoryIconData, getResolvedCategoryIconId, hasCategoryIconData } from './categoryIconData'

describe('category icon data', () => {
  it('contains exactly the static local modules declared by the catalog', () => {
    const catalogIds = CATEGORY_ICON_CATALOG.map((icon) => icon.id)
    const dataIds = Object.keys(CATEGORY_ICON_DATA)

    expect(CATEGORY_ICON_CATALOG).toHaveLength(300)
    expect(Object.keys(CATEGORY_ICON_DATA)).toHaveLength(300)
    expect(dataIds.sort()).toEqual(catalogIds.sort())
    expect(catalogIds.filter((id) => !dataIds.includes(id))).toEqual([])
    expect(dataIds.filter((id) => !catalogIds.includes(id))).toEqual([])
    expect(Object.values(CATEGORY_ICON_DATA).every((icon) => Boolean(icon.body))).toBe(true)
  })

  it('resolves catalog icons without a network lookup', () => {
    const iconId = 'mdi:church'

    expect(hasCategoryIconData(iconId)).toBe(true)
    expect(getResolvedCategoryIconId(iconId)).toBe(iconId)
    expect(getCategoryIconData(iconId).body).toBeTruthy()
  })

  it('resolves the default and fallback locally, without fetch', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')

    expect(getCategoryIconData(DEFAULT_CATEGORY_ICON_ID).body).toBeTruthy()
    expect(getCategoryIconData(FALLBACK_CATEGORY_ICON_ID).body).toBeTruthy()
    expect(getResolvedCategoryIconId('mdi:not-installed')).toBe(FALLBACK_CATEGORY_ICON_ID)
    expect(getResolvedCategoryIconId(null)).toBe(FALLBACK_CATEGORY_ICON_ID)
    expect(getCategoryIconData('mdi:not-installed')).toBe(CATEGORY_ICON_DATA[FALLBACK_CATEGORY_ICON_ID])
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
