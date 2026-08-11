import { Icon } from '@iconify/react'
import { useEffect, useState } from 'react'

import { getCategoryIconData, getResolvedCategoryIconId, loadCategoryIconData } from '../../icons/categoryIconData'
import { getCategoryIconLabel } from '../../icons/categoryIconRuntime'

interface CategoryIconPreviewProps {
  iconId: string | null | undefined
  size?: number
  showLabel?: boolean
  ariaLabel?: string
  title?: string
  className?: string
}

export function CategoryIconPreview({ iconId, size = 20, showLabel = true, ariaLabel, title, className }: CategoryIconPreviewProps) {
  const resolvedIconId = getResolvedCategoryIconId(iconId)
  const isFallback = iconId !== resolvedIconId
  const [iconData, setIconData] = useState(() => getCategoryIconData(iconId))

  useEffect(() => {
    let active = true
    setIconData(getCategoryIconData(iconId))
    void loadCategoryIconData(iconId).then((data) => { if (active) setIconData(data) })
    return () => { active = false }
  }, [iconId])

  return (
    <span className={`category-icon-preview${className ? ` ${className}` : ''}`} data-category-icon-id={resolvedIconId} title={title} role={ariaLabel ? 'img' : undefined} aria-label={ariaLabel}>
      <Icon aria-hidden="true" icon={iconData} width={size} height={size} />
      {showLabel && <span>{isFallback ? `${getCategoryIconLabel(iconId)} (icône inconnue)` : getCategoryIconLabel(iconId)}</span>}
    </span>
  )
}
