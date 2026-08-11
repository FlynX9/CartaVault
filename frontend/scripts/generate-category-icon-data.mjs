import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { validateCategoryIconCatalog } from './category-icon-validation.mjs'

const MIN_ICONS = 1400
const MAX_ICONS = 1600
const root = resolve(import.meta.dirname, '..')
const catalogPath = resolve(root, '..', 'shared', 'category-icons.json')
const legacyPath = resolve(root, '..', 'shared', 'category-icons.legacy.json')
const eagerOutputPath = resolve(root, 'src', 'icons', 'categoryIconData.generated.ts')
const lazyOutputPath = resolve(root, 'src', 'icons', 'categoryIconData.lazy.generated.ts')
const lazyGroupsPath = resolve(root, 'src', 'icons', 'category-icon-groups.generated')
const runtimeOutputPath = resolve(root, 'src', 'icons', 'categoryIconRuntime.generated.ts')
const lazyMetadataOutputPath = resolve(root, 'src', 'icons', 'categoryIconMetadata.lazy.generated.ts')
const catalog = JSON.parse(readFileSync(catalogPath, 'utf8'))
const legacyIds = JSON.parse(readFileSync(legacyPath, 'utf8'))

validateCategoryIconCatalog(catalog, legacyIds, (prefix, name) => existsSync(resolve(root, 'node_modules', '@iconify-icons', prefix === 'mdi' ? 'mdi' : 'material-symbols', `${name}.js`)))

if (!Array.isArray(catalog) || catalog.length < MIN_ICONS || catalog.length > MAX_ICONS) {
  throw new Error(`Expected ${MIN_ICONS}-${MAX_ICONS} catalog entries, received ${catalog?.length ?? 'invalid'}`)
}
if (!Array.isArray(legacyIds) || legacyIds.length !== 300 || legacyIds.some((id) => typeof id !== 'string')) {
  throw new Error('The legacy category icon baseline must contain exactly 300 IDs')
}

const names = new Set()
const normalizedRecords = new Set()
const legacySet = new Set(legacyIds)
const eagerImports = ['// AUTO-GENERATED. DO NOT EDIT MANUALLY.', "import type { IconifyIcon } from '@iconify/types'"]
const eagerEntries = []
const lazyGroups = new Map()
const runtimeMetadata = []
const lazyMetadata = []
const missing = []

for (const [index, entry] of catalog.entries()) {
  if (!entry || typeof entry.id !== 'string' || names.has(entry.id)) throw new Error(`Invalid or duplicate icon at index ${index}`)
  if (typeof entry.label !== 'string' || !entry.label.trim() || typeof entry.group !== 'string' || !entry.group || !Array.isArray(entry.keywords) || entry.keywords.length === 0) throw new Error(`Invalid metadata for ${entry.id}`)
  names.add(entry.id)
  const normalized = `${entry.id.toLowerCase()}|${entry.label.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()}|${entry.group}`
  if (normalizedRecords.has(normalized)) throw new Error(`Duplicate normalized category icon record: ${entry.label} (${entry.group})`)
  normalizedRecords.add(normalized)

  const [prefix, name] = entry.id.split(':')
  const packageName = prefix === 'mdi' ? 'mdi' : prefix === 'material-symbols' ? 'material-symbols' : null
  if (!packageName || !name || entry.id.split(':').length !== 2) throw new Error(`Unsupported icon identifier: ${entry.id}`)
  const file = resolve(root, 'node_modules', '@iconify-icons', packageName, `${name}.js`)
  if (!existsSync(file)) { missing.push(entry.id); continue }
  const icon = { index, id: entry.id, group: entry.group, packageName, name }
  if (legacySet.has(entry.id)) {
    eagerImports.push(`import icon${index} from '@iconify-icons/${packageName}/${name}'`)
    eagerEntries.push(`  ${JSON.stringify(entry.id)}: icon${index},`)
  } else {
    const group = lazyGroups.get(entry.group) ?? []
    group.push(icon)
    lazyGroups.set(entry.group, group)
  }
  const metadataEntry = `  ${JSON.stringify(entry.id)}: [${JSON.stringify(entry.label)}, ${JSON.stringify(entry.group)}],`
  ;(legacySet.has(entry.id) ? runtimeMetadata : lazyMetadata).push(metadataEntry)
}

const missingLegacy = legacyIds.filter((id) => !names.has(id))
if (missingLegacy.length) throw new Error(`Legacy category icons were removed: ${missingLegacy.join(', ')}`)
if (missing.length) throw new Error(`Missing local Iconify modules: ${missing.join(', ')}`)

eagerImports.push('', 'export const CATEGORY_ICON_DATA = {', ...eagerEntries, '} as const satisfies Readonly<Record<string, IconifyIcon>>', '')
const sortedGroups = [...lazyGroups].sort(([left], [right]) => left.localeCompare(right))
const lazyIndex = [
  '// AUTO-GENERATED. DO NOT EDIT MANUALLY.',
  "import type { IconifyIcon } from '@iconify/types'", '',
  'const loaders = {',
  ...sortedGroups.map(([group]) => `  ${JSON.stringify(group)}: () => import('./category-icon-groups.generated/${group}.generated').then((module) => module.CATEGORY_ICON_GROUP_DATA),`),
  '} as const', '',
  'export type LazyCategoryIconGroup = keyof typeof loaders',
  'export const loadCategoryIconGroup = (group: string): Promise<Readonly<Record<string, IconifyIcon>>> => {',
  '  const loader = loaders[group as LazyCategoryIconGroup]',
  '  return loader ? loader() : Promise.resolve({})',
  '}', '',
]
const runtimeLines = [
  '// AUTO-GENERATED. DO NOT EDIT MANUALLY.',
  'export const CATEGORY_ICON_METADATA = {', ...runtimeMetadata,
  '} as const satisfies Readonly<Record<string, readonly [label: string, group: string]>>', '',
  `export const CATEGORY_ICON_COUNT = ${catalog.length}`, '',
]
const lazyMetadataLines = [
  '// AUTO-GENERATED. DO NOT EDIT MANUALLY.',
  'export const CATEGORY_ICON_LAZY_METADATA = {', ...lazyMetadata,
  '} as const satisfies Readonly<Record<string, readonly [label: string, group: string]>>', '',
]
const groupOutputs = sortedGroups.map(([group, icons]) => {
  const lines = ['// AUTO-GENERATED. DO NOT EDIT MANUALLY.', "import type { IconifyIcon } from '@iconify/types'"]
  lines.push(...icons.map(({ index, packageName, name }) => `import icon${index} from '@iconify-icons/${packageName}/${name}'`))
  lines.push('', 'export const CATEGORY_ICON_GROUP_DATA = {', ...icons.map(({ index, id }) => `  ${JSON.stringify(id)}: icon${index},`), '} as const satisfies Readonly<Record<string, IconifyIcon>>', '')
  return [resolve(lazyGroupsPath, `${group}.generated.ts`), lines.join('\n')]
})
const outputs = [
  [eagerOutputPath, eagerImports.join('\n')],
  [lazyOutputPath, lazyIndex.join('\n')],
  [runtimeOutputPath, runtimeLines.join('\n')],
  [lazyMetadataOutputPath, lazyMetadataLines.join('\n')],
  ...groupOutputs,
]

if (process.argv.includes('--check')) {
  for (const [path, output] of outputs) {
    if (!existsSync(path) || readFileSync(path, 'utf8') !== output) throw new Error(`${path} is out of date; run npm run generate:category-icons`)
  }
  const expectedGroupFiles = new Set(groupOutputs.map(([path]) => path))
  for (const file of existsSync(lazyGroupsPath) ? readdirSync(lazyGroupsPath) : []) {
    if (!expectedGroupFiles.has(resolve(lazyGroupsPath, file))) throw new Error(`${file} is a stale generated icon group file`)
  }
} else {
  mkdirSync(lazyGroupsPath, { recursive: true })
  const expectedGroupFiles = new Set(groupOutputs.map(([path]) => path))
  for (const file of readdirSync(lazyGroupsPath)) {
    const path = resolve(lazyGroupsPath, file)
    if (!expectedGroupFiles.has(path)) unlinkSync(path)
  }
  for (const [path, output] of outputs) writeFileSync(path, output)
}
