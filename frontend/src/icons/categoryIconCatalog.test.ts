import { describe, expect, it } from 'vitest'
import { CATEGORY_ICON_CATALOG, FALLBACK_CATEGORY_ICON_ID, searchCategoryIcons } from './categoryIconCatalog'

describe('category icon catalog', () => {
  it('is a curated valid catalog', () => { expect(CATEGORY_ICON_CATALOG).toHaveLength(80); expect(new Set(CATEGORY_ICON_CATALOG.map((item) => item.id)).size).toBe(80); expect(CATEGORY_ICON_CATALOG.some((item) => item.id === FALLBACK_CATEGORY_ICON_ID)).toBe(true) })
  it('searches labels and keywords without accents', () => { expect(searchCategoryIcons('eglise').some((item) => item.label === 'Église')).toBe(true); expect(searchCategoryIcons('chateau eau').some((item) => item.label === 'Château d’eau')).toBe(true) })
})
