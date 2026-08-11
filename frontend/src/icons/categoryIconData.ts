import type { IconifyIcon } from '@iconify/types'

import { CATEGORY_ICON_DATA } from './categoryIconData.generated'
import { FALLBACK_CATEGORY_ICON_ID, getResolvedCategoryIconId, hasCategoryIconId, loadCategoryIconMetadata } from './categoryIconRuntime'

const loadedIconData: Record<string, IconifyIcon> = { ...CATEGORY_ICON_DATA }
const groupPromises = new Map<string, Promise<Readonly<Record<string, IconifyIcon>>>>()

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
  await lazyRegistry(metadata![1])
  return loadedIconData[resolved] ?? loadedIconData[FALLBACK_CATEGORY_ICON_ID]!
}
