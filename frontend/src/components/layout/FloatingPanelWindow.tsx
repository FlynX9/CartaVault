import { createContext, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react'

export const RESET_DESKTOP_PANEL_LAYOUT_EVENT = 'cartavault:reset-desktop-panel-layout'
export const DESKTOP_PANEL_LAYOUT_MODE_EVENT = 'cartavault:desktop-panel-layout-mode-changed'

export interface FloatingPanelGeometry {
  x: number
  y: number
  width: number
  height: number
}

export const FloatingPanelWindowContext = createContext<{ locked: boolean; maximized: boolean; toggleMaximize: () => void } | null>(null)

interface FloatingPanelWindowProps {
  kind: 'workspace' | 'trips' | 'detail' | 'editor'
  label: string
  storageKey: string
  initialGeometry: FloatingPanelGeometry
  minWidth: number
  maxWidth?: number
  minHeight?: number
  fitContentSelector?: string
  fitContentMaxHeight?: number
  collapsed?: boolean
  collapsedWidth?: number
  resetVersion: number
  active: boolean
  hidden?: boolean
  locked?: boolean
  onActivate: () => void
  onGeometryCommit?: (geometry: FloatingPanelGeometry) => void
  children: ReactNode
}

type ResizeEdge = 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw'
type Interaction = {
  pointerId: number
  startX: number
  startY: number
  geometry: FloatingPanelGeometry
  mode: 'move' | ResizeEdge
}

const VIEWPORT_MARGIN = 12
const DEFAULT_MIN_HEIGHT = 260
const PANEL_HEADER_HEIGHT = 56

function readGeometry(storageKey: string, fallback: FloatingPanelGeometry): FloatingPanelGeometry {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(storageKey) ?? '') as Partial<FloatingPanelGeometry>
    if ([parsed.x, parsed.y, parsed.width, parsed.height].every(Number.isFinite)) return parsed as FloatingPanelGeometry
  } catch { /* Invalid or unavailable local storage falls back to the default layout. */ }
  return fallback
}

function saveGeometry(storageKey: string, geometry: FloatingPanelGeometry): void {
  try { window.localStorage.setItem(storageKey, JSON.stringify(geometry)) } catch { /* Private contexts may block storage. */ }
}

function clampGeometry(
  geometry: FloatingPanelGeometry,
  workspace: HTMLElement,
  minWidth: number,
  maxWidth: number,
  minHeight: number,
): FloatingPanelGeometry {
  if (workspace.clientWidth <= 0 || workspace.clientHeight <= 0) return geometry
  const availableWidth = Math.max(1, workspace.clientWidth - VIEWPORT_MARGIN * 2)
  const availableHeight = Math.max(1, workspace.clientHeight - VIEWPORT_MARGIN * 2)
  const width = Math.min(availableWidth, Math.max(Math.min(minWidth, availableWidth), Math.min(maxWidth, geometry.width)))
  const height = Math.min(availableHeight, Math.max(Math.min(minHeight, availableHeight), geometry.height))
  return {
    x: Math.min(Math.max(VIEWPORT_MARGIN, geometry.x), Math.max(VIEWPORT_MARGIN, workspace.clientWidth - width - VIEWPORT_MARGIN)),
    y: Math.min(Math.max(VIEWPORT_MARGIN, geometry.y), Math.max(VIEWPORT_MARGIN, workspace.clientHeight - PANEL_HEADER_HEIGHT - VIEWPORT_MARGIN)),
    width,
    height,
  }
}

function resizedGeometry(start: FloatingPanelGeometry, edge: ResizeEdge, deltaX: number, deltaY: number): FloatingPanelGeometry {
  const next = { ...start }
  if (edge.includes('e')) next.width = start.width + deltaX
  if (edge.includes('s')) next.height = start.height + deltaY
  if (edge.includes('w')) { next.x = start.x + deltaX; next.width = start.width - deltaX }
  if (edge.includes('n')) { next.y = start.y + deltaY; next.height = start.height - deltaY }
  return next
}

export function FloatingPanelWindow({
  kind,
  label,
  storageKey,
  initialGeometry,
  minWidth,
  maxWidth = Number.POSITIVE_INFINITY,
  minHeight = DEFAULT_MIN_HEIGHT,
  fitContentSelector,
  fitContentMaxHeight = Number.POSITIVE_INFINITY,
  collapsed = false,
  collapsedWidth = 208,
  resetVersion,
  active,
  hidden = false,
  locked = false,
  onActivate,
  onGeometryCommit,
  children,
}: FloatingPanelWindowProps) {
  const frameRef = useRef<HTMLDivElement>(null)
  const interactionRef = useRef<Interaction | null>(null)
  const restoreGeometryRef = useRef<FloatingPanelGeometry | null>(null)
  const heightManuallyResizedRef = useRef(false)
  const maximizedRef = useRef(false)
  const initialResetVersionRef = useRef(resetVersion)
  const [geometry, setGeometry] = useState(() => locked ? initialGeometry : readGeometry(storageKey, initialGeometry))
  const [maximized, setMaximized] = useState(false)
  const geometryRef = useRef(geometry)

  const updateGeometry = (next: FloatingPanelGeometry) => {
    geometryRef.current = next
    setGeometry(next)
  }
  const updateMaximized = (next: boolean) => {
    maximizedRef.current = next
    setMaximized(next)
  }

  const workspace = () => frameRef.current?.closest<HTMLElement>('.map-workspace') ?? null
  const normalize = (candidate: FloatingPanelGeometry) => {
    const owner = workspace()
    return owner ? clampGeometry(candidate, owner, minWidth, maxWidth, minHeight) : candidate
  }
  const commit = (candidate: FloatingPanelGeometry) => {
    const next = normalize(candidate)
    updateGeometry(next)
    saveGeometry(storageKey, next)
    onGeometryCommit?.(next)
  }

  useEffect(() => {
    if (initialResetVersionRef.current === resetVersion) return
    initialResetVersionRef.current = resetVersion
    heightManuallyResizedRef.current = false
    updateMaximized(false)
    commit(initialGeometry)
  }, [initialGeometry, resetVersion])

  useEffect(() => {
    if (!fitContentSelector || heightManuallyResizedRef.current) return
    const content = frameRef.current?.querySelector<HTMLElement>(fitContentSelector)
    if (!content) return
    const fit = () => {
      if (heightManuallyResizedRef.current) return
      const measuredHeight = Math.ceil(content.getBoundingClientRect().height) || content.scrollHeight
      if (measuredHeight <= 0) return
      const owner = workspace()
      const availableHeight = owner ? owner.clientHeight - VIEWPORT_MARGIN * 2 : fitContentMaxHeight
      const nextHeight = Math.min(fitContentMaxHeight, availableHeight, Math.max(minHeight, measuredHeight))
      if (Math.abs(geometryRef.current.height - nextHeight) < 1) return
      commit({ ...geometryRef.current, height: nextHeight })
    }
    fit()
    const resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(fit)
    resizeObserver?.observe(content)
    const mutationObserver = typeof MutationObserver === 'undefined' ? null : new MutationObserver(fit)
    mutationObserver?.observe(content, { childList: true, subtree: true, characterData: true })
    return () => { resizeObserver?.disconnect(); mutationObserver?.disconnect() }
  }, [fitContentMaxHeight, fitContentSelector, minHeight])

  useEffect(() => {
    const owner = workspace()
    if (!owner) return
    const keepVisible = () => {
      const next = maximizedRef.current
        ? clampGeometry({ x: VIEWPORT_MARGIN, y: VIEWPORT_MARGIN, width: owner.clientWidth - VIEWPORT_MARGIN * 2, height: owner.clientHeight - VIEWPORT_MARGIN * 2 }, owner, minWidth, maxWidth, minHeight)
        : clampGeometry(geometryRef.current, owner, minWidth, maxWidth, minHeight)
      updateGeometry(next)
      const fillsWorkspace = next.x === VIEWPORT_MARGIN && next.y === VIEWPORT_MARGIN && Math.abs(next.width - (owner.clientWidth - VIEWPORT_MARGIN * 2)) < 1 && Math.abs(next.height - (owner.clientHeight - VIEWPORT_MARGIN * 2)) < 1
      updateMaximized(fillsWorkspace)
    }
    keepVisible()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(keepVisible)
    observer.observe(owner)
    return () => observer.disconnect()
  }, [maxWidth, minHeight, minWidth])

  useEffect(() => () => {
    document.body.classList.remove('cv-panel-window-moving', 'cv-panel-window-resizing')
  }, [])

  const beginMove = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || locked || window.matchMedia?.('(max-width: 760px)').matches) return
    const target = event.target as HTMLElement
    if (target.closest('button, a, input, select, textarea, [role="button"], [data-panel-no-drag]')) return
    if (!target.closest('.cv-workspace-panel__header, .places-redesign-header, .trip-panel-header, .popup-heading, .sidebar-header')) return
    updateMaximized(false)
    interactionRef.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, geometry, mode: 'move' }
    event.currentTarget.setPointerCapture?.(event.pointerId)
    document.body.classList.add('cv-panel-window-moving')
    onActivate()
    event.preventDefault()
  }

  const beginResize = (event: PointerEvent<HTMLDivElement>, edge: ResizeEdge) => {
    if (event.button !== 0 || collapsed || locked || window.matchMedia?.('(max-width: 760px)').matches) return
    if (edge.includes('n') || edge.includes('s')) heightManuallyResizedRef.current = true
    updateMaximized(false)
    interactionRef.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, geometry, mode: edge }
    frameRef.current?.setPointerCapture?.(event.pointerId)
    document.body.classList.add('cv-panel-window-resizing')
    onActivate()
    event.preventDefault()
    event.stopPropagation()
  }

  const move = (event: PointerEvent<HTMLDivElement>) => {
    const interaction = interactionRef.current
    if (!interaction || interaction.pointerId !== event.pointerId) return
    const deltaX = event.clientX - interaction.startX
    const deltaY = event.clientY - interaction.startY
    const candidate = interaction.mode === 'move'
      ? { ...interaction.geometry, x: interaction.geometry.x + deltaX, y: interaction.geometry.y + deltaY }
      : resizedGeometry(interaction.geometry, interaction.mode, deltaX, deltaY)
    updateGeometry(normalize(candidate))
  }

  const finish = (event: PointerEvent<HTMLDivElement>) => {
    if (interactionRef.current?.pointerId !== event.pointerId) return
    interactionRef.current = null
    document.body.classList.remove('cv-panel-window-moving', 'cv-panel-window-resizing')
    commit(geometryRef.current)
  }

  const resizeWithKeyboard = (event: KeyboardEvent<HTMLDivElement>, edge: ResizeEdge) => {
    const step = event.shiftKey ? 64 : 24
    const deltaX = event.key === 'ArrowRight' ? step : event.key === 'ArrowLeft' ? -step : 0
    const deltaY = event.key === 'ArrowDown' ? step : event.key === 'ArrowUp' ? -step : 0
    if ((deltaX === 0 && deltaY === 0) || collapsed || locked) return
    if ((edge.includes('n') || edge.includes('s')) && deltaY !== 0) heightManuallyResizedRef.current = true
    updateMaximized(false)
    commit(resizedGeometry(geometryRef.current, edge, deltaX, deltaY))
    event.preventDefault()
  }

  const resizeLabel = (edge: ResizeEdge) => {
    if (edge === 'e') return kind === 'workspace' ? 'Redimensionner le panneau de navigation' : 'Redimensionner le panneau Sorties'
    return `Redimensionner ${label} (${edge})`
  }

  const toggleMaximize = () => {
    const owner = workspace()
    if (!owner) return
    if (maximizedRef.current) {
      const restore = restoreGeometryRef.current ?? readGeometry(`${storageKey}:restore`, initialGeometry)
      updateMaximized(false)
      commit(restore)
      onActivate()
      return
    }
    restoreGeometryRef.current = geometryRef.current
    saveGeometry(`${storageKey}:restore`, geometryRef.current)
    updateMaximized(true)
    commit({ x: VIEWPORT_MARGIN, y: VIEWPORT_MARGIN, width: owner.clientWidth - VIEWPORT_MARGIN * 2, height: owner.clientHeight - VIEWPORT_MARGIN * 2 })
    onActivate()
  }

  const displayedWidth = collapsed ? collapsedWidth : geometry.width
  const displayedHeight = collapsed ? PANEL_HEADER_HEIGHT : geometry.height
  const owner = workspace()
  const displayedX = owner ? Math.min(geometry.x, Math.max(VIEWPORT_MARGIN, owner.clientWidth - displayedWidth - VIEWPORT_MARGIN)) : geometry.x
  const displayedY = owner ? Math.min(geometry.y, Math.max(VIEWPORT_MARGIN, owner.clientHeight - PANEL_HEADER_HEIGHT - VIEWPORT_MARGIN)) : geometry.y

  return <div
    ref={frameRef}
    className={`cv-floating-panel-window cv-floating-panel-window--${kind}${collapsed ? ' is-collapsed' : ''}${active ? ' is-active' : ''}${hidden ? ' is-hidden' : ''}${locked ? ' is-locked' : ''}`}
    aria-label={label}
    style={{ left: displayedX, top: displayedY, width: displayedWidth, height: displayedHeight }}
    onPointerDown={beginMove}
    onPointerMove={move}
    onPointerUp={finish}
    onPointerCancel={finish}
    onMouseDown={onActivate}
  >
    <div className="cv-floating-panel-window__content"><FloatingPanelWindowContext.Provider value={{ locked, maximized, toggleMaximize }}>{children}</FloatingPanelWindowContext.Provider></div>
    {!collapsed && !locked && (['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'] as ResizeEdge[]).map((edge) => <div
      key={edge}
      className={`cv-floating-panel-window__resize cv-floating-panel-window__resize--${edge}`}
      data-panel-no-drag
      role="separator"
      tabIndex={edge === 'e' || edge === 's' ? 0 : -1}
      aria-label={resizeLabel(edge)}
      aria-orientation={edge === 'e' || edge === 'w' ? 'vertical' : edge === 'n' || edge === 's' ? 'horizontal' : undefined}
      aria-valuemin={edge === 'e' || edge === 'w' ? minWidth : minHeight}
      aria-valuemax={(edge === 'e' || edge === 'w') && Number.isFinite(maxWidth) ? maxWidth : undefined}
      aria-valuenow={edge === 'e' || edge === 'w' ? Math.round(geometry.width) : edge === 'n' || edge === 's' ? Math.round(geometry.height) : undefined}
      onKeyDown={(event) => resizeWithKeyboard(event, edge)}
      onPointerDown={(event) => beginResize(event, edge)}
    />)}
  </div>
}
