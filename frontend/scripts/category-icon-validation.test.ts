import { describe, expect, it } from 'vitest'

import catalog from '../../shared/category-icons.json'
import legacyIds from '../../shared/category-icons.legacy.json'
import { validateCategoryIconCatalog } from './category-icon-validation.mjs'

const cloneCatalog = () => structuredClone(catalog)

describe('category icon catalog generator validation', () => {
  it('accepts the deterministic source catalog and all local imports', () => {
    expect(validateCategoryIconCatalog(catalog, legacyIds).count).toBe(1500)
    expect(JSON.stringify(cloneCatalog())).toBe(JSON.stringify(catalog))
  })

  it('rejects duplicate IDs', () => {
    const invalid = cloneCatalog()
    invalid[1] = { ...invalid[1], id: invalid[0].id }
    expect(() => validateCategoryIconCatalog(invalid, legacyIds)).toThrow(/duplicate icon/)
  })

  it('rejects unknown groups', () => {
    const invalid = cloneCatalog()
    invalid[0] = { ...invalid[0], group: 'unknown' }
    expect(() => validateCategoryIconCatalog(invalid, legacyIds)).toThrow(/Invalid category icon group/)
  })

  it('rejects unresolved local icon imports', () => {
    expect(() => validateCategoryIconCatalog(catalog, legacyIds, (_prefix, name) => name !== 'church')).toThrow(/Missing local Iconify module/)
  })

  it('rejects a missing legacy ID', () => {
    const invalid = cloneCatalog().filter((entry) => entry.id !== legacyIds[0])
    invalid.push({ ...invalid.at(-1)!, id: 'mdi:test-replacement' })
    expect(() => validateCategoryIconCatalog(invalid, legacyIds)).toThrow(/Legacy category icons were removed/)
  })
})
