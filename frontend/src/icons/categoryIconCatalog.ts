import rawCatalog from '../../../shared/category-icons.json'

export const CATEGORY_ICON_GROUPS = ['buildings', 'religion', 'industry', 'military', 'health', 'education', 'culture', 'transport', 'tourism', 'infrastructure', 'nature', 'access', 'other'] as const
export type CategoryIconGroup = typeof CATEGORY_ICON_GROUPS[number]

export interface CategoryIconCatalogEntry {
  readonly id: string
  readonly label: string
  readonly group: CategoryIconGroup
  readonly keywords: readonly string[]
}

const CATALOG_ENTRY_FIELDS = new Set(['id', 'label', 'group', 'keywords'])

export const DEFAULT_CATEGORY_ICON_ID = 'material-symbols:location-on-outline'
export const FALLBACK_CATEGORY_ICON_ID = 'material-symbols:help-outline'
export const GROUP_LABELS: Readonly<Record<CategoryIconGroup, string>> = {
  buildings: 'Bâtiments',
  religion: 'Religion',
  industry: 'Industrie',
  military: 'Militaire',
  health: 'Santé',
  education: 'Enseignement',
  culture: 'Culture',
  transport: 'Transport',
  tourism: 'Tourisme',
  infrastructure: 'Infrastructures',
  nature: 'Nature',
  access: 'Accès et sécurité',
  other: 'Divers',
}

export const normalizeIconSearch = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/\s+/g, ' ')

function validate(entries: unknown): readonly CategoryIconCatalogEntry[] {
  if (!Array.isArray(entries) || entries.length < 80 || entries.length > 100) throw new Error('Invalid category icon catalog size')

  const ids = new Set<string>()
  for (const entry of entries) {
    if (!entry || typeof entry !== 'object') throw new Error('Invalid category icon catalog entry')

    const icon = entry as CategoryIconCatalogEntry
    if (
      Object.keys(icon).some((field) => !CATALOG_ENTRY_FIELDS.has(field))
      || typeof icon.id !== 'string'
      || !icon.id.trim()
      || typeof icon.label !== 'string'
      || !icon.label.trim()
      || !CATEGORY_ICON_GROUPS.includes(icon.group)
      || !Array.isArray(icon.keywords)
      || icon.keywords.length === 0
      || icon.keywords.some((item) => typeof item !== 'string' || !item.trim())
      || ids.has(icon.id)
    ) throw new Error('Invalid category icon catalog entry')

    ids.add(icon.id)
  }

  if (!ids.has(DEFAULT_CATEGORY_ICON_ID) || !ids.has(FALLBACK_CATEGORY_ICON_ID)) throw new Error('Missing category icon defaults')
  return entries
}

export const CATEGORY_ICON_CATALOG = validate(rawCatalog)
export const getCategoryIcon = (id?: string | null) => CATEGORY_ICON_CATALOG.find((item) => item.id === id) ?? CATEGORY_ICON_CATALOG.find((item) => item.id === FALLBACK_CATEGORY_ICON_ID)!

export function searchCategoryIcons(query = '', group?: CategoryIconGroup): readonly CategoryIconCatalogEntry[] {
  const terms = normalizeIconSearch(query).split(' ').filter(Boolean)
  return CATEGORY_ICON_CATALOG.filter((item) => {
    const searchableText = normalizeIconSearch([item.label, ...item.keywords, item.id].join(' '))
    return (!group || item.group === group) && terms.every((term) => searchableText.includes(term))
  })
}
