import type { IconifyIcon } from '@iconify/types'

import { CATEGORY_ICON_CATALOG, FALLBACK_CATEGORY_ICON_ID } from './categoryIconCatalog'
import { CATEGORY_ICON_DATA } from './categoryIconData.generated'

const categoryIconData: Readonly<Record<string, IconifyIcon>> = CATEGORY_ICON_DATA
const catalogIconIds = new Set(CATEGORY_ICON_CATALOG.map((icon) => icon.id))
const localIconIds = new Set(Object.keys(CATEGORY_ICON_DATA))
const missingIconData = [...catalogIconIds].filter((id) => !localIconIds.has(id))
const orphanedIconData = [...localIconIds].filter((id) => !catalogIconIds.has(id))

if (missingIconData.length || orphanedIconData.length || !CATEGORY_ICON_DATA[FALLBACK_CATEGORY_ICON_ID]) {
  throw new Error('Category icon data is not synchronized with the catalog')
}

export const hasCategoryIconData = (id: string | null | undefined): boolean => id !== undefined && id !== null && id in CATEGORY_ICON_DATA
export const getResolvedCategoryIconId = (id: string | null | undefined): string => hasCategoryIconData(id) ? id! : FALLBACK_CATEGORY_ICON_ID
export const getCategoryIconData = (id: string | null | undefined): IconifyIcon => categoryIconData[getResolvedCategoryIconId(id)]!
