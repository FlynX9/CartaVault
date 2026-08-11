import { useVirtualizer } from '@tanstack/react-virtual'
import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'

import type { CategoryIconCatalogEntry } from '../../icons/categoryIconCatalog'
import { CategoryIconPreview } from './CategoryIconPreview'

interface CategoryIconGridProps {
  icons: readonly CategoryIconCatalogEntry[]
  selectedIconId: string
  onSelect: (iconId: string) => void
  onChoose: (iconId: string) => void
}

const ITEM_MIN_WIDTH = 88
const ROW_HEIGHT = 84

export function CategoryIconGrid({ icons, selectedIconId, onSelect, onChoose }: CategoryIconGridProps) {
  const scrollElement = useRef<HTMLDivElement>(null)
  const buttonReferences = useRef(new Map<string, HTMLButtonElement>())
  const [viewportWidth, setViewportWidth] = useState(560)
  const columns = Math.max(2, Math.floor(viewportWidth / ITEM_MIN_WIDTH))
  const rowCount = Math.ceil(icons.length / columns)
  const rows = useMemo(() => Array.from({ length: rowCount }, (_, row) => icons.slice(row * columns, (row + 1) * columns)), [columns, icons, rowCount])
  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => scrollElement.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 3,
    initialRect: { width: 560, height: 360 },
    observeElementRect: (instance, callback) => {
      const element = instance.scrollElement
      if (!element) return
      const update = () => callback({ width: element.clientWidth || 560, height: element.clientHeight || 360 })
      update()
      if (typeof ResizeObserver === 'undefined') return
      const observer = new ResizeObserver(update)
      observer.observe(element)
      return () => observer.disconnect()
    },
  })

  useEffect(() => {
    const element = scrollElement.current
    if (!element) return
    const update = () => setViewportWidth(element.clientWidth || 560)
    update()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(update)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const focusIndex = (index: number) => {
    const bounded = Math.min(Math.max(index, 0), icons.length - 1)
    virtualizer.scrollToIndex(Math.floor(bounded / columns), { align: 'auto' })
    window.setTimeout(() => buttonReferences.current.get(icons[bounded]?.id ?? '')?.focus(), 0)
  }

  const moveFocus = (event: ReactKeyboardEvent<HTMLButtonElement>, iconId: string) => {
    const currentIndex = icons.findIndex((icon) => icon.id === iconId)
    if (currentIndex === -1) return
    const offsets: Partial<Record<string, number>> = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: columns, ArrowUp: -columns }
    if (event.key === 'Home') { event.preventDefault(); focusIndex(0); return }
    if (event.key === 'End') { event.preventDefault(); focusIndex(icons.length - 1); return }
    const offset = offsets[event.key]
    if (offset === undefined) return
    event.preventDefault()
    focusIndex(currentIndex + offset)
  }

  return <div ref={scrollElement} className="category-icon-grid" role="grid" aria-label="Icônes disponibles" aria-rowcount={rowCount} aria-colcount={columns}>
    <div className="category-icon-grid__canvas" style={{ height: virtualizer.getTotalSize() }}>
      {virtualizer.getVirtualItems().map((virtualRow) => <div
        className="category-icon-grid__row"
        key={virtualRow.key}
        role="row"
        style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, transform: `translateY(${virtualRow.start}px)` }}
      >
        {rows[virtualRow.index]?.map((icon, columnIndex) => {
          const selected = icon.id === selectedIconId
          return <button
            className={`category-icon-option${selected ? ' selected' : ''}`}
            type="button"
            role="gridcell"
            aria-colindex={columnIndex + 1}
            aria-rowindex={virtualRow.index + 1}
            aria-pressed={selected}
            aria-label={`${icon.label}${selected ? ', sélectionnée' : ''}`}
            key={icon.id}
            ref={(node) => { if (node) buttonReferences.current.set(icon.id, node); else buttonReferences.current.delete(icon.id) }}
            onClick={() => onSelect(icon.id)}
            onDoubleClick={() => onChoose(icon.id)}
            onKeyDown={(event) => moveFocus(event, icon.id)}
          >
            <CategoryIconPreview iconId={icon.id} size={21} showLabel={false} />
            <span>{icon.label}</span>
            {selected && <small>Choisie</small>}
          </button>
        })}
      </div>)}
    </div>
  </div>
}
