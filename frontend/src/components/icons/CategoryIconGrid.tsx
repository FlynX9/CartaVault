import { useRef, type KeyboardEvent as ReactKeyboardEvent } from 'react'

import type { CategoryIconCatalogEntry } from '../../icons/categoryIconCatalog'
import { CategoryIconPreview } from './CategoryIconPreview'

interface CategoryIconGridProps {
  icons: readonly CategoryIconCatalogEntry[]
  selectedIconId: string
  onSelect: (iconId: string) => void
  onChoose: (iconId: string) => void
}

const GRID_COLUMNS = 6

export function CategoryIconGrid({ icons, selectedIconId, onSelect, onChoose }: CategoryIconGridProps) {
  const buttonReferences = useRef(new Map<string, HTMLButtonElement>())

  const moveFocus = (event: ReactKeyboardEvent<HTMLButtonElement>, iconId: string) => {
    const currentIndex = icons.findIndex((icon) => icon.id === iconId)
    if (currentIndex === -1) return

    const offsets: Partial<Record<string, number>> = {
      ArrowRight: 1,
      ArrowLeft: -1,
      ArrowDown: GRID_COLUMNS,
      ArrowUp: -GRID_COLUMNS,
    }
    const offset = offsets[event.key]
    let targetIndex = currentIndex

    if (event.key === 'Home') targetIndex = 0
    else if (event.key === 'End') targetIndex = icons.length - 1
    else if (offset !== undefined) targetIndex = Math.min(Math.max(currentIndex + offset, 0), icons.length - 1)
    else return

    event.preventDefault()
    buttonReferences.current.get(icons[targetIndex]?.id ?? '')?.focus()
  }

  return (
    <div className="category-icon-grid" role="grid" aria-label="Icônes disponibles">
      {icons.map((icon) => {
        const selected = icon.id === selectedIconId
        return (
          <button
            className={`category-icon-option${selected ? ' selected' : ''}`}
            type="button"
            role="gridcell"
            aria-pressed={selected}
            aria-label={`${icon.label}${selected ? ', sélectionnée' : ''}`}
            key={icon.id}
            ref={(node) => {
              if (node) buttonReferences.current.set(icon.id, node)
              else buttonReferences.current.delete(icon.id)
            }}
            onClick={() => onSelect(icon.id)}
            onDoubleClick={() => onChoose(icon.id)}
            onKeyDown={(event) => moveFocus(event, icon.id)}
          >
            <CategoryIconPreview iconId={icon.id} size={21} showLabel={false} />
            <span>{icon.label}</span>
            {selected && <small>Choisie</small>}
          </button>
        )
      })}
    </div>
  )
}
