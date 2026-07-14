import { readFileSync, existsSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const catalogPath = resolve(root, '..', 'shared', 'category-icons.json')
const outputPath = resolve(root, 'src', 'icons', 'categoryIconData.generated.ts')
const catalog = JSON.parse(readFileSync(catalogPath, 'utf8'))
if (!Array.isArray(catalog) || catalog.length !== 80) throw new Error(`Expected 80 catalog entries, received ${catalog.length}`)
const names = new Set()
const lines = ['// Generated file. Do not edit manually.', "import type { IconifyIcon } from '@iconify/types'"]
const entries = []
const missing = []
for (const [index, entry] of catalog.entries()) {
  if (!entry || typeof entry.id !== 'string' || names.has(entry.id)) throw new Error(`Invalid or duplicate icon at index ${index}`)
  names.add(entry.id)
  const [prefix, name] = entry.id.split(':')
  const packageName = prefix === 'mdi' ? 'mdi' : prefix === 'material-symbols' ? 'material-symbols' : null
  if (!packageName || !name || entry.id.split(':').length !== 2) throw new Error(`Unsupported icon identifier: ${entry.id}`)
  const file = resolve(root, 'node_modules', '@iconify-icons', packageName, `${name}.js`)
  if (!existsSync(file)) { missing.push(entry.id); continue }
  const local = `icon${index}`
  lines.push(`import ${local} from '@iconify-icons/${packageName}/${name}'`)
  entries.push(`  ${JSON.stringify(entry.id)}: ${local},`)
}
if (missing.length) throw new Error(`Missing local Iconify modules: ${missing.join(', ')}`)
lines.push('', 'export const CATEGORY_ICON_DATA = {', ...entries, '} as const satisfies Readonly<Record<string, IconifyIcon>>', '')
const output = lines.join('\n')
if (process.argv.includes('--check')) {
  if (!existsSync(outputPath) || readFileSync(outputPath, 'utf8') !== output) throw new Error('categoryIconData.generated.ts is out of date; run npm run generate:category-icons')
} else writeFileSync(outputPath, output)
