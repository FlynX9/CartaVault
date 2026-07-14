import { Icon } from '@iconify/react'

import { getCategoryIcon } from '../../icons/categoryIconCatalog'
import { getCategoryIconData, getResolvedCategoryIconId } from '../../icons/categoryIconData'

interface CategoryIconPreviewProps {
  iconId: string | null | undefined
  size?: number
  showLabel?: boolean
}

export function CategoryIconPreview({ iconId, size = 20, showLabel = true }: CategoryIconPreviewProps) {
  const icon = getCategoryIcon(iconId)
  const resolvedIconId = getResolvedCategoryIconId(iconId)
  const isFallback = iconId !== resolvedIconId

  return (
    <span className="category-icon-preview">
      <Icon aria-hidden="true" icon={getCategoryIconData(iconId)} width={size} height={size} />
      {showLabel && <span>{isFallback ? `${icon.label} (icône inconnue)` : icon.label}</span>}
    </span>
  )
}
