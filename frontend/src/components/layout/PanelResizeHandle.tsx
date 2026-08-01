import { useEffect, useRef, type KeyboardEvent, type PointerEvent } from 'react'

interface PanelResizeHandleProps {
  side: 'left' | 'right'
  growDirection?: 'left' | 'right'
  width: number
  minWidth?: number
  maxWidth?: number
  reservedWidth?: number
  panelSelector?: string
  boundarySelector?: string
  gapReferenceSelector?: string
  onResize: (width: number) => void
  onResizeCommit?: (width: number) => void
}

const MIN_PANEL_WIDTH = 320
const MAX_PANEL_WIDTH = 720
const KEYBOARD_STEP = 24

function panelBounds(workspace: HTMLElement, minWidth: number, maxWidth: number, reservedWidth: number, panelSelector?: string, boundarySelector?: string, gapReferenceSelector?: string): { min: number; max: number } {
  const workspaceRect = workspace.getBoundingClientRect()
  const scaleX = workspaceRect.width > 0 ? workspace.clientWidth / workspaceRect.width : 1
  let availableMaximum = workspace.clientWidth - reservedWidth
  const panel = panelSelector ? workspace.querySelector<HTMLElement>(panelSelector) : null
  const boundary = boundarySelector ? workspace.querySelector<HTMLElement>(boundarySelector) : null
  if (panel) {
    const panelRect = panel.getBoundingClientRect()
    availableMaximum = Math.min(availableMaximum, (workspaceRect.right - panelRect.left) * scaleX - reservedWidth)
  }
  if (panel && boundary) {
    const panelRect = panel.getBoundingClientRect()
    const boundaryRect = boundary.getBoundingClientRect()
    const gapReference = gapReferenceSelector ? workspace.querySelector<HTMLElement>(gapReferenceSelector) : null
    const referenceRect = gapReference?.getBoundingClientRect()
    const visualGap = referenceRect ? Math.max(0, panelRect.left - referenceRect.right) : 0
    availableMaximum = Math.min(availableMaximum, (boundaryRect.left - panelRect.left - visualGap) * scaleX)
  }
  return {
    min: minWidth,
    max: Math.max(minWidth, Math.min(maxWidth, availableMaximum)),
  }
}

function clampWidth(width: number, workspace: HTMLElement, minWidth: number, maxWidth: number, reservedWidth: number, panelSelector?: string, boundarySelector?: string, gapReferenceSelector?: string): number {
  const { min, max } = panelBounds(workspace, minWidth, maxWidth, reservedWidth, panelSelector, boundarySelector, gapReferenceSelector)
  return Math.round(Math.min(max, Math.max(min, width)))
}

export function PanelResizeHandle({
  side,
  growDirection = side === 'left' ? 'right' : 'left',
  width,
  minWidth = MIN_PANEL_WIDTH,
  maxWidth = MAX_PANEL_WIDTH,
  reservedWidth = 320,
  panelSelector,
  boundarySelector,
  gapReferenceSelector,
  onResize,
  onResizeCommit,
}: PanelResizeHandleProps) {
  const drag = useRef<{ pointerId: number; startX: number; startWidth: number; scaleX: number } | null>(null)
  const pendingWidth = useRef<number | null>(null)
  const animationFrame = useRef<number | null>(null)

  const flushResize = () => {
    if (animationFrame.current !== null) {
      window.cancelAnimationFrame(animationFrame.current)
      animationFrame.current = null
    }
    if (pendingWidth.current !== null) {
      onResize(pendingWidth.current)
      pendingWidth.current = null
    }
  }

  const scheduleResize = (nextWidth: number) => {
    pendingWidth.current = nextWidth
    if (animationFrame.current !== null) return
    animationFrame.current = window.requestAnimationFrame(() => {
      animationFrame.current = null
      if (pendingWidth.current !== null) {
        onResize(pendingWidth.current)
        pendingWidth.current = null
      }
    })
  }

  useEffect(() => () => {
    if (animationFrame.current !== null) window.cancelAnimationFrame(animationFrame.current)
    document.body.classList.remove('cv-panel-resizing')
  }, [])

  const workspaceFor = (element: HTMLElement) => element.closest<HTMLElement>('.map-workspace')

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    const workspace = workspaceFor(event.currentTarget)
    if (!workspace) return
    const bounds = workspace.getBoundingClientRect()
    const renderedPanel = panelSelector ? workspace.querySelector<HTMLElement>(panelSelector) : null
    const renderedWidth = renderedPanel?.getBoundingClientRect().width
    const scaleX = bounds.width > 0 ? workspace.clientWidth / bounds.width : 1
    drag.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startWidth: renderedWidth && renderedWidth > 0 ? renderedWidth * scaleX : width,
      scaleX,
    }
    event.currentTarget.setPointerCapture?.(event.pointerId)
    document.body.classList.add('cv-panel-resizing')
    event.preventDefault()
  }

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const current = drag.current
    const workspace = workspaceFor(event.currentTarget)
    if (!current || current.pointerId !== event.pointerId || !workspace) return
    const delta = (event.clientX - current.startX) * current.scaleX * (growDirection === 'right' ? 1 : -1)
    scheduleResize(clampWidth(current.startWidth + delta, workspace, minWidth, maxWidth, reservedWidth, panelSelector, boundarySelector, gapReferenceSelector))
  }

  const stopDragging = (event: PointerEvent<HTMLDivElement>) => {
    if (drag.current?.pointerId !== event.pointerId) return
    const committedWidth = pendingWidth.current
    flushResize()
    drag.current = null
    event.currentTarget.releasePointerCapture?.(event.pointerId)
    document.body.classList.remove('cv-panel-resizing')
    if (committedWidth !== null) onResizeCommit?.(committedWidth)
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const workspace = workspaceFor(event.currentTarget)
    if (!workspace) return
    const growKey = growDirection === 'right' ? 'ArrowRight' : 'ArrowLeft'
    const shrinkKey = growDirection === 'right' ? 'ArrowLeft' : 'ArrowRight'
    let nextWidth: number | null = null
    if (event.key === growKey) nextWidth = width + KEYBOARD_STEP
    if (event.key === shrinkKey) nextWidth = width - KEYBOARD_STEP
    if (event.key === 'Home') nextWidth = panelBounds(workspace, minWidth, maxWidth, reservedWidth, panelSelector, boundarySelector, gapReferenceSelector).min
    if (event.key === 'End') nextWidth = panelBounds(workspace, minWidth, maxWidth, reservedWidth, panelSelector, boundarySelector, gapReferenceSelector).max
    if (nextWidth === null) return
    event.preventDefault()
    const clampedWidth = clampWidth(nextWidth, workspace, minWidth, maxWidth, reservedWidth, panelSelector, boundarySelector, gapReferenceSelector)
    onResize(clampedWidth)
    onResizeCommit?.(clampedWidth)
  }

  return <div
    className={`cv-panel-resize-handle cv-panel-resize-handle--${side}`}
    role="separator"
    aria-label={`Redimensionner le panneau ${side === 'left' ? 'de navigation' : 'Sorties'}`}
    aria-orientation="vertical"
    aria-valuemin={minWidth}
    aria-valuemax={maxWidth}
    aria-valuenow={Math.round(width)}
    tabIndex={0}
    onPointerDown={handlePointerDown}
    onPointerMove={handlePointerMove}
    onPointerUp={stopDragging}
    onPointerCancel={stopDragging}
    onKeyDown={handleKeyDown}
  />
}
