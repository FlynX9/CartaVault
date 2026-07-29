import { useEffect, useState, type ReactNode, type RefObject } from 'react'

const OVERSCAN = 8

interface VirtualPlaceRowsProps<T> {
  items: readonly T[]
  scrollRoot: RefObject<HTMLElement | null>
  estimatedRowHeight: number
  className: string
  renderRow: (item: T, index: number) => ReactNode
}

/** Keeps the DOM bounded while retaining the native scroll container and list semantics. */
export function VirtualPlaceRows<T>({ items, scrollRoot, estimatedRowHeight, className, renderRow }: VirtualPlaceRowsProps<T>) {
  const [viewport, setViewport] = useState({ top: 0, height: 640 })

  useEffect(() => {
    const root = scrollRoot.current
    if (!root) return
    const update = () => setViewport({ top: root.scrollTop, height: root.clientHeight || 640 })
    update()
    root.addEventListener('scroll', update, { passive: true })
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update)
    observer?.observe(root)
    return () => { root.removeEventListener('scroll', update); observer?.disconnect() }
  }, [scrollRoot])

  const first = Math.max(0, Math.floor(viewport.top / estimatedRowHeight) - OVERSCAN)
  const last = Math.min(items.length, Math.ceil((viewport.top + viewport.height) / estimatedRowHeight) + OVERSCAN)
  const before = first * estimatedRowHeight
  const after = Math.max(0, (items.length - last) * estimatedRowHeight)

  return <ul className={className} aria-setsize={items.length}>
    {before > 0 && <li aria-hidden="true" className="place-list-virtual-spacer" style={{ height: before }} />}
    {items.slice(first, last).map((item, offset) => renderRow(item, first + offset))}
    {after > 0 && <li aria-hidden="true" className="place-list-virtual-spacer" style={{ height: after }} />}
  </ul>
}
