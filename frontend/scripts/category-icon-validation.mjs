export const MIN_CATEGORY_ICONS = 1400
export const MAX_CATEGORY_ICONS = 1600
export const CATEGORY_ICON_GROUP_IDS = new Set([
  'buildings', 'religion', 'industry', 'military', 'health', 'education', 'culture', 'transport',
  'tourism', 'infrastructure', 'nature', 'access', 'urban', 'commerce', 'accommodation',
  'administration', 'heritage', 'other', 'gastronomy', 'photography', 'hiking', 'water',
  'mountain', 'agriculture', 'energy', 'maritime', 'sport', 'archaeology',
])

export function validateCategoryIconCatalog(catalog, legacyIds, moduleExists = () => true) {
  if (!Array.isArray(catalog) || catalog.length < MIN_CATEGORY_ICONS || catalog.length > MAX_CATEGORY_ICONS) {
    throw new Error(`Expected ${MIN_CATEGORY_ICONS}-${MAX_CATEGORY_ICONS} catalog entries, received ${catalog?.length ?? 'invalid'}`)
  }
  if (!Array.isArray(legacyIds) || legacyIds.length !== 300 || legacyIds.some((id) => typeof id !== 'string')) {
    throw new Error('The legacy category icon baseline must contain exactly 300 IDs')
  }
  const ids = new Set()
  const normalizedRecords = new Set()
  for (const [index, entry] of catalog.entries()) {
    if (!entry || typeof entry.id !== 'string' || ids.has(entry.id)) throw new Error(`Invalid or duplicate icon at index ${index}`)
    if (typeof entry.label !== 'string' || !entry.label.trim() || typeof entry.group !== 'string' || !entry.group || !Array.isArray(entry.keywords) || entry.keywords.length === 0) throw new Error(`Invalid metadata for ${entry.id}`)
    if (!CATEGORY_ICON_GROUP_IDS.has(entry.group)) throw new Error(`Invalid category icon group for ${entry.id}: ${entry.group}`)
    const [prefix, name, extra] = entry.id.split(':')
    if ((prefix !== 'mdi' && prefix !== 'material-symbols') || !name || extra) throw new Error(`Unsupported icon identifier: ${entry.id}`)
    if (!moduleExists(prefix, name)) throw new Error(`Missing local Iconify module: ${entry.id}`)
    const normalized = `${entry.id.toLowerCase()}|${entry.label.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()}|${entry.group}`
    if (normalizedRecords.has(normalized)) throw new Error(`Duplicate normalized category icon record: ${entry.label} (${entry.group})`)
    ids.add(entry.id)
    normalizedRecords.add(normalized)
  }
  const missingLegacy = legacyIds.filter((id) => !ids.has(id))
  if (missingLegacy.length) throw new Error(`Legacy category icons were removed: ${missingLegacy.join(', ')}`)
  return { count: ids.size }
}
