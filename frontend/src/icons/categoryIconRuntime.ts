import { CATEGORY_ICON_COUNT, CATEGORY_ICON_METADATA } from './categoryIconRuntime.generated'

export const DEFAULT_CATEGORY_ICON_ID = 'material-symbols:location-on-outline'
export const FALLBACK_CATEGORY_ICON_ID = 'material-symbols:help-outline'
const loadedCategoryIconMetadata: Record<string, readonly [label: string, group: string]> = { ...CATEGORY_ICON_METADATA }

export const hasCategoryIconId = (id: string | null | undefined): id is string => Boolean(id && id in loadedCategoryIconMetadata)
export const getResolvedCategoryIconId = (id: string | null | undefined): string => hasCategoryIconId(id) ? id : FALLBACK_CATEGORY_ICON_ID
export const getCategoryIconLabel = (id: string | null | undefined): string => loadedCategoryIconMetadata[getResolvedCategoryIconId(id)]![0]
export const getCategoryIconGroup = (id: string | null | undefined): string => loadedCategoryIconMetadata[getResolvedCategoryIconId(id)]![1]
export async function loadCategoryIconMetadata(id: string | null | undefined): Promise<readonly [label: string, group: string] | null> {
  if (!id) return null
  if (id in loadedCategoryIconMetadata) return loadedCategoryIconMetadata[id]!
  const { CATEGORY_ICON_LAZY_METADATA } = await import('./categoryIconMetadata.lazy.generated')
  const metadata = CATEGORY_ICON_LAZY_METADATA[id as keyof typeof CATEGORY_ICON_LAZY_METADATA]
  Object.assign(loadedCategoryIconMetadata, CATEGORY_ICON_LAZY_METADATA)
  return metadata ?? null
}

export { CATEGORY_ICON_COUNT }
