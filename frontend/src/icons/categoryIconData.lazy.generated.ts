// AUTO-GENERATED. DO NOT EDIT MANUALLY.
import type { IconifyIcon } from '@iconify/types'

const loaders = {
  "access": () => import('./category-icon-groups.generated/access.generated').then((module) => module.CATEGORY_ICON_GROUP_DATA),
  "accommodation": () => import('./category-icon-groups.generated/accommodation.generated').then((module) => module.CATEGORY_ICON_GROUP_DATA),
  "administration": () => import('./category-icon-groups.generated/administration.generated').then((module) => module.CATEGORY_ICON_GROUP_DATA),
  "agriculture": () => import('./category-icon-groups.generated/agriculture.generated').then((module) => module.CATEGORY_ICON_GROUP_DATA),
  "archaeology": () => import('./category-icon-groups.generated/archaeology.generated').then((module) => module.CATEGORY_ICON_GROUP_DATA),
  "buildings": () => import('./category-icon-groups.generated/buildings.generated').then((module) => module.CATEGORY_ICON_GROUP_DATA),
  "commerce": () => import('./category-icon-groups.generated/commerce.generated').then((module) => module.CATEGORY_ICON_GROUP_DATA),
  "culture": () => import('./category-icon-groups.generated/culture.generated').then((module) => module.CATEGORY_ICON_GROUP_DATA),
  "education": () => import('./category-icon-groups.generated/education.generated').then((module) => module.CATEGORY_ICON_GROUP_DATA),
  "energy": () => import('./category-icon-groups.generated/energy.generated').then((module) => module.CATEGORY_ICON_GROUP_DATA),
  "gastronomy": () => import('./category-icon-groups.generated/gastronomy.generated').then((module) => module.CATEGORY_ICON_GROUP_DATA),
  "health": () => import('./category-icon-groups.generated/health.generated').then((module) => module.CATEGORY_ICON_GROUP_DATA),
  "heritage": () => import('./category-icon-groups.generated/heritage.generated').then((module) => module.CATEGORY_ICON_GROUP_DATA),
  "hiking": () => import('./category-icon-groups.generated/hiking.generated').then((module) => module.CATEGORY_ICON_GROUP_DATA),
  "industry": () => import('./category-icon-groups.generated/industry.generated').then((module) => module.CATEGORY_ICON_GROUP_DATA),
  "infrastructure": () => import('./category-icon-groups.generated/infrastructure.generated').then((module) => module.CATEGORY_ICON_GROUP_DATA),
  "maritime": () => import('./category-icon-groups.generated/maritime.generated').then((module) => module.CATEGORY_ICON_GROUP_DATA),
  "military": () => import('./category-icon-groups.generated/military.generated').then((module) => module.CATEGORY_ICON_GROUP_DATA),
  "mountain": () => import('./category-icon-groups.generated/mountain.generated').then((module) => module.CATEGORY_ICON_GROUP_DATA),
  "nature": () => import('./category-icon-groups.generated/nature.generated').then((module) => module.CATEGORY_ICON_GROUP_DATA),
  "other": () => import('./category-icon-groups.generated/other.generated').then((module) => module.CATEGORY_ICON_GROUP_DATA),
  "photography": () => import('./category-icon-groups.generated/photography.generated').then((module) => module.CATEGORY_ICON_GROUP_DATA),
  "religion": () => import('./category-icon-groups.generated/religion.generated').then((module) => module.CATEGORY_ICON_GROUP_DATA),
  "sport": () => import('./category-icon-groups.generated/sport.generated').then((module) => module.CATEGORY_ICON_GROUP_DATA),
  "tourism": () => import('./category-icon-groups.generated/tourism.generated').then((module) => module.CATEGORY_ICON_GROUP_DATA),
  "transport": () => import('./category-icon-groups.generated/transport.generated').then((module) => module.CATEGORY_ICON_GROUP_DATA),
  "urban": () => import('./category-icon-groups.generated/urban.generated').then((module) => module.CATEGORY_ICON_GROUP_DATA),
  "water": () => import('./category-icon-groups.generated/water.generated').then((module) => module.CATEGORY_ICON_GROUP_DATA),
} as const

export type LazyCategoryIconGroup = keyof typeof loaders
export const loadCategoryIconGroup = (group: string): Promise<Readonly<Record<string, IconifyIcon>>> => {
  const loader = loaders[group as LazyCategoryIconGroup]
  return loader ? loader() : Promise.resolve({})
}
