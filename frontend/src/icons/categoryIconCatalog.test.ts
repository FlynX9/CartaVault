import { describe, expect, it } from 'vitest'
import legacyIds from '../../../shared/category-icons.legacy.json'
import { CATEGORY_ICON_CATALOG, FALLBACK_CATEGORY_ICON_ID, searchCategoryIcons } from './categoryIconCatalog'

describe('category icon catalog', () => {
  it('is a curated valid catalog', () => { expect(CATEGORY_ICON_CATALOG).toHaveLength(1500); expect(new Set(CATEGORY_ICON_CATALOG.map((item) => item.id)).size).toBe(1500); expect(CATEGORY_ICON_CATALOG.some((item) => item.id === FALLBACK_CATEGORY_ICON_ID)).toBe(true) })
  it('retains every legacy icon ID', () => { expect(legacyIds).toHaveLength(300); expect(legacyIds.every((id) => CATEGORY_ICON_CATALOG.some((icon) => icon.id === id))).toBe(true) })
  it('searches labels and keywords without accents or word-order sensitivity', () => { expect(searchCategoryIcons('eglise').some((item) => item.label === 'Église')).toBe(true); expect(searchCategoryIcons('chateau eau').some((item) => item.label === 'Château d’eau')).toBe(true); expect(searchCategoryIcons('depot ferroviaire').some((item) => item.id === 'mdi:train')).toBe(true); expect(searchCategoryIcons('hopital psychiatrique').some((item) => item.id === 'mdi:hospital-building')).toBe(true); expect(searchCategoryIcons('poste frontiere').some((item) => item.id === 'mdi:door')).toBe(true); expect(searchCategoryIcons('prison').some((item) => item.id === 'mdi:police-station')).toBe(true) })
  it('finds expanded CartaVault domains and respects group filtering', () => {
    expect(searchCategoryIcons('cascade').some((item) => item.id === 'mdi:waterfall')).toBe(true)
    expect(searchCategoryIcons('boulangerie').some((item) => item.id === 'mdi:bread-slice')).toBe(true)
    expect(searchCategoryIcons('photo').some((item) => item.group === 'photography')).toBe(true)
    expect(searchCategoryIcons('', 'gastronomy')).toHaveLength(120)
    expect(searchCategoryIcons('', 'gastronomy').every((item) => item.group === 'gastronomy')).toBe(true)
  })
})
