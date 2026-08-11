import { describe, expect, it, vi } from 'vitest'

import { CATEGORY_ICON_CATALOG } from './categoryIconCatalog'
import { CATEGORY_ICON_DATA } from './categoryIconData.generated'
import { getCategoryIconData, getResolvedCategoryIconId, hasCategoryIconData, loadCategoryIconData } from './categoryIconData'
import { DEFAULT_CATEGORY_ICON_ID, FALLBACK_CATEGORY_ICON_ID } from './categoryIconRuntime'

describe('category icon data', () => {
  it('keeps the 300 legacy modules and their metadata eager', () => {
    expect(CATEGORY_ICON_CATALOG).toHaveLength(1500)
    expect(Object.keys(CATEGORY_ICON_DATA)).toHaveLength(300)
    expect(Object.keys(CATEGORY_ICON_DATA).every((iconId) => hasCategoryIconData(iconId))).toBe(true)
    expect(Object.values(CATEGORY_ICON_DATA).every((icon) => Boolean(icon.body))).toBe(true)
  })

  it('loads expanded icon modules locally on demand', async () => {
    const expandedId = 'mdi:waterfall'
    expect(hasCategoryIconData(expandedId)).toBe(false)
    expect((await loadCategoryIconData(expandedId)).body).toBeTruthy()
    expect(hasCategoryIconData(expandedId)).toBe(true)
    expect(getResolvedCategoryIconId(expandedId)).toBe(expandedId)
    expect(getCategoryIconData(expandedId).body).toBeTruthy()
  })

  it('resolves defaults and fallback without a network lookup', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    expect((await loadCategoryIconData(DEFAULT_CATEGORY_ICON_ID)).body).toBeTruthy()
    expect(getCategoryIconData(FALLBACK_CATEGORY_ICON_ID).body).toBeTruthy()
    expect(getResolvedCategoryIconId('mdi:not-installed')).toBe(FALLBACK_CATEGORY_ICON_ID)
    expect(getResolvedCategoryIconId(null)).toBe(FALLBACK_CATEGORY_ICON_ID)
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
