import { readFile, stat, writeFile } from 'node:fs/promises'
import { basename } from 'node:path'

const manifestPath = new URL('../dist/.vite/manifest.json', import.meta.url)
const reportPath = new URL('../dist/bundle-report.json', import.meta.url)
const INITIAL_JAVASCRIPT_BUDGET_BYTES = 900_000

async function fileSize(path) {
  return (await stat(new URL(`../dist/${path}`, import.meta.url))).size
}

function collectStaticImports(manifest, entryName) {
  const visited = new Set()
  const visit = (name) => {
    if (visited.has(name)) return
    visited.add(name)
    for (const imported of manifest[name]?.imports ?? []) visit(imported)
  }
  visit(entryName)
  return [...visited]
}

async function main() {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
  const entry = Object.entries(manifest).find(([, item]) => item.isEntry)
  if (!entry) throw new Error('No Vite entry was found in dist/.vite/manifest.json.')

  const [entryName, entryAsset] = entry
  const initialAssets = collectStaticImports(manifest, entryName)
  const chunks = await Promise.all(Object.entries(manifest)
    .filter(([, item]) => item.file.endsWith('.js'))
    .map(async ([name, item]) => ({
      name,
      file: item.file,
      bytes: await fileSize(item.file),
      initial: initialAssets.includes(name),
      dynamicEntry: Boolean(item.isDynamicEntry),
    })))
  const initialJavaScriptBytes = chunks
    .filter((chunk) => chunk.initial)
    .reduce((total, chunk) => total + chunk.bytes, 0)
  const report = {
    generatedAt: new Date().toISOString(),
    entry: entryAsset.file,
    budgets: { initialJavaScriptBytes: INITIAL_JAVASCRIPT_BUDGET_BYTES },
    initialJavaScriptBytes,
    chunks: chunks.sort((left, right) => right.bytes - left.bytes),
  }
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`)

  console.table(report.chunks.map((chunk) => ({
    chunk: basename(chunk.file),
    kb: (chunk.bytes / 1024).toFixed(1),
    initial: chunk.initial ? 'yes' : 'no',
    lazy: chunk.dynamicEntry ? 'yes' : 'no',
  })))
  console.log(`Initial JavaScript: ${(initialJavaScriptBytes / 1024).toFixed(1)} KiB / ${(INITIAL_JAVASCRIPT_BUDGET_BYTES / 1024).toFixed(1)} KiB budget`)
  if (process.argv.includes('--check') && initialJavaScriptBytes > INITIAL_JAVASCRIPT_BUDGET_BYTES) {
    throw new Error(`Initial JavaScript budget exceeded by ${initialJavaScriptBytes - INITIAL_JAVASCRIPT_BUDGET_BYTES} bytes.`)
  }
}

await main()
