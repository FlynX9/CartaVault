import type { IconifyIcon } from '@iconify/types'

import { FALLBACK_CATEGORY_ICON_ID, getResolvedCategoryIconId, hasCategoryIconId, loadCategoryIconMetadata } from './categoryIconRuntime'

const fallbackIconData: IconifyIcon = {
  height: 24,
  width: 24,
  body: '<path fill="currentColor" d="M11.95 18q.525 0 .888-.363t.362-.887q0-.525-.362-.888t-.888-.362q-.525 0-.887.363t-.363.887q0 .525.363.888t.887.362Zm-.9-3.85h1.85q0-.825.188-1.3t1.062-1.3q.65-.65 1.025-1.238T15.55 8.9q0-1.4-1.025-2.15T12.1 6q-1.425 0-2.313.75T8.55 8.55l1.65.65q.125-.45.563-.975T12.1 7.7q.8 0 1.2.438t.4.962q0 .5-.3.938t-.75.812q-1.1.975-1.35 1.475t-.25 1.825ZM12 22q-2.075 0-3.9-.788t-3.175-2.137q-1.35-1.35-2.137-3.175T2 12q0-2.075.788-3.9t2.137-3.175q1.35-1.35 3.175-2.137T12 2q2.075 0 3.9.788t3.175 2.137q1.35 1.35 2.138 3.175T22 12q0 2.075-.788 3.9t-2.137 3.175q-1.35 1.35-3.175 2.138T12 22Zm0-2q3.35 0 5.675-2.325T20 12q0-3.35-2.325-5.675T12 4Q8.65 4 6.325 6.325T4 12q0 3.35 2.325 5.675T12 20Zm0-8Z"/>',
}
const loadedIconData: Record<string, IconifyIcon> = { [FALLBACK_CATEGORY_ICON_ID]: fallbackIconData }
const groupPromises = new Map<string, Promise<Readonly<Record<string, IconifyIcon>>>>()
let legacyIconDataPromise: Promise<Readonly<Record<string, IconifyIcon>>> | null = null

export const loadLegacyCategoryIconData = (): Promise<Readonly<Record<string, IconifyIcon>>> => legacyIconDataPromise ??= import('./categoryIconData.generated')
  .then(({ CATEGORY_ICON_DATA }) => {
    Object.assign(loadedIconData, CATEGORY_ICON_DATA)
    return CATEGORY_ICON_DATA
  })
  // Keep the synchronous fallback usable if the lazy chunk cannot be loaded.
  .catch(() => ({}))

const lazyRegistry = (group: string) => {
  let promise = groupPromises.get(group)
  if (!promise) {
    promise = import('./categoryIconData.lazy.generated')
      .then(({ loadCategoryIconGroup }) => loadCategoryIconGroup(group))
      .then((icons) => { Object.assign(loadedIconData, icons); return icons })
    groupPromises.set(group, promise)
  }
  return promise
}

export const hasCategoryIconData = (id: string | null | undefined): boolean => hasCategoryIconId(id)
export { getResolvedCategoryIconId }
export const getCategoryIconData = (id: string | null | undefined): IconifyIcon => loadedIconData[getResolvedCategoryIconId(id)] ?? loadedIconData[FALLBACK_CATEGORY_ICON_ID]!
export async function loadCategoryIconData(id: string | null | undefined): Promise<IconifyIcon> {
  const metadata = await loadCategoryIconMetadata(id)
  const resolved = metadata ? id! : getResolvedCategoryIconId(id)
  if (loadedIconData[resolved]) return loadedIconData[resolved]
  const legacyIconData = await loadLegacyCategoryIconData()
  if (legacyIconData[resolved]) return legacyIconData[resolved]
  if (!metadata) return fallbackIconData
  await lazyRegistry(metadata![1])
  return loadedIconData[resolved] ?? loadedIconData[FALLBACK_CATEGORY_ICON_ID]!
}
