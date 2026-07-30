import {
  defaultRangeExtractor,
  observeElementRect,
  useVirtualizer,
  type Range,
} from '@tanstack/react-virtual'
import { memo, useCallback, useEffect, useState, type ReactNode, type RefObject } from 'react'

const OVERSCAN = 8
const LIST_PADDING = 10

interface VirtualPlaceRowsProps<T> {
  items: readonly T[]
  scrollRoot: RefObject<HTMLElement | null>
  estimatedRowHeight: number
  className: string
  getItemKey: (item: T) => string
  scrollToIndex?: number
  renderVersion: string
  renderRow: (item: T, index: number) => ReactNode
}

/**
 * Variable-height, accessible list virtualization.
 *
 * The focused row is retained in the rendered range so recycling cannot make
 * keyboard focus disappear. Arrow keys can move to rows that are not mounted
 * yet; the virtualizer scrolls them into view before transferring focus.
 */
function VirtualPlaceRowsComponent<T>({
  items,
  scrollRoot,
  estimatedRowHeight,
  className,
  getItemKey,
  scrollToIndex,
  renderVersion: _renderVersion,
  renderRow,
}: VirtualPlaceRowsProps<T>) {
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null)
  const rangeExtractor = useCallback((range: Range) => {
    const indexes = defaultRangeExtractor(range)
    const retained = [focusedIndex, scrollToIndex].filter(
      (index): index is number =>
        index !== null &&
        index !== undefined &&
        index >= 0 &&
        index < items.length &&
        !indexes.includes(index),
    )
    return retained.length === 0
      ? indexes
      : [...indexes, ...retained].sort((left, right) => left - right)
  }, [focusedIndex, items.length, scrollToIndex])
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollRoot.current,
    estimateSize: () => estimatedRowHeight,
    initialRect: { width: 0, height: 640 },
    getItemKey: (index) => getItemKey(items[index]),
    measureElement: (element) =>
      element.getBoundingClientRect().height || estimatedRowHeight,
    observeElementRect: (instance, callback) =>
      observeElementRect(instance, (rect) =>
        callback({ ...rect, height: rect.height || 640 }),
      ),
    overscan: OVERSCAN,
    rangeExtractor,
  })

  useEffect(() => {
    virtualizer.measure()
  }, [estimatedRowHeight, virtualizer])

  useEffect(() => {
    if (scrollToIndex === undefined || scrollToIndex < 0 || scrollToIndex >= items.length) return
    virtualizer.scrollToIndex(scrollToIndex, {
      align: 'center',
      // CSS supplies motion when allowed; "auto" remains reliable while
      // variable-height rows are still being measured.
      behavior: 'auto',
    })
  }, [items.length, scrollToIndex, virtualizer])

  const focusRow = useCallback((index: number) => {
    if (index < 0 || index >= items.length) return
    setFocusedIndex(index)
    virtualizer.scrollToIndex(index, { align: 'auto' })
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        scrollRoot.current
          ?.querySelector<HTMLElement>(`[data-virtual-index="${index}"] [data-place-row-focus]`)
          ?.focus()
      })
    })
  }, [items.length, scrollRoot, virtualizer])

  const virtualItems = virtualizer.getVirtualItems()

  return (
    <ul
      className={`${className} place-list-virtual`}
      aria-label={`Lieux, ${items.length} éléments`}
      aria-setsize={items.length}
      style={{ height: virtualizer.getTotalSize() + LIST_PADDING * 2 }}
      onFocusCapture={(event) => {
        const row = event.target instanceof Element
          ? event.target.closest<HTMLElement>('[data-virtual-index]')
          : null
        if (row) setFocusedIndex(Number(row.dataset.virtualIndex))
      }}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocusedIndex(null)
      }}
      onKeyDown={(event) => {
        if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
        const row = event.target instanceof Element
          ? event.target.closest<HTMLElement>('[data-virtual-index]')
          : null
        if (!row) return
        event.preventDefault()
        focusRow(Number(row.dataset.virtualIndex) + (event.key === 'ArrowDown' ? 1 : -1))
      }}
    >
      {virtualItems.map((virtualRow) => (
        <li
          key={virtualRow.key}
          ref={virtualizer.measureElement}
          data-index={virtualRow.index}
          data-virtual-index={virtualRow.index}
          aria-posinset={virtualRow.index + 1}
          aria-setsize={items.length}
          className="place-list-virtual-row"
          style={{ transform: `translateY(${virtualRow.start + LIST_PADDING}px)` }}
        >
          {renderRow(items[virtualRow.index], virtualRow.index)}
        </li>
      ))}
    </ul>
  )
}

function arePropsEqual<T>(
  previous: VirtualPlaceRowsProps<T>,
  next: VirtualPlaceRowsProps<T>,
) {
  return (
    previous.items === next.items &&
    previous.scrollRoot === next.scrollRoot &&
    previous.estimatedRowHeight === next.estimatedRowHeight &&
    previous.className === next.className &&
    previous.scrollToIndex === next.scrollToIndex &&
    previous.renderVersion === next.renderVersion
  )
}

/**
 * `renderRow` is deliberately excluded from the comparison: callers commonly
 * create it inline. `renderVersion` explicitly captures every row-visible state.
 */
export const VirtualPlaceRows = memo(
  VirtualPlaceRowsComponent,
  arePropsEqual,
) as typeof VirtualPlaceRowsComponent
