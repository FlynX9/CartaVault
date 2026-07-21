import { useEffect, useRef, type KeyboardEvent, type PointerEvent } from 'react'

interface PanelResizeHandleProps {
  side: 'left' | 'right'
  width: number
  onResize: (width: number) => void
}

const MIN_PANEL_WIDTH = 320
const MAX_PANEL_WIDTH = 720
const KEYBOARD_STEP = 24

function panelBounds(workspace: HTMLElement): { min: number; max: number } {
  return {
    min: MIN_PANEL_WIDTH,
    max: Math.max(MIN_PANEL_WIDTH, Math.min(MAX_PANEL_WIDTH, workspace.clientWidth - 96)),
  }
}

function clampWidth(width: number, workspace: HTMLElement): number {
  const { min, max } = panelBounds(workspace)
  return Math.round(Math.min(max, Math.max(min, width)))
}

export function PanelResizeHandle({ side, width, onResize }: PanelResizeHandleProps) {
  const drag = useRef<{ pointerId: number; startX: number; startWidth: number; scaleX: number } | null>(null)

  useEffect(() => () => document.body.classList.remove('cv-panel-resizing'), [])

  const workspaceFor = (element: HTMLElement) => element.closest<HTMLElement>('.map-workspace')

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    const workspace = workspaceFor(event.currentTarget)
    if (!workspace) return
    const bounds = workspace.getBoundingClientRect()
    drag.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startWidth: width,
      scaleX: bounds.width > 0 ? workspace.clientWidth / bounds.width : 1,
    }
    event.currentTarget.setPointerCapture?.(event.pointerId)
    document.body.classList.add('cv-panel-resizing')
    event.preventDefault()
  }

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const current = drag.current
    const workspace = workspaceFor(event.currentTarget)
    if (!current || current.pointerId !== event.pointerId || !workspace) return
    const delta = (event.clientX - current.startX) * current.scaleX * (side === 'left' ? 1 : -1)
    onResize(clampWidth(current.startWidth + delta, workspace))
  }

  const stopDragging = (event: PointerEvent<HTMLDivElement>) => {
    if (drag.current?.pointerId !== event.pointerId) return
    drag.current = null
    event.currentTarget.releasePointerCapture?.(event.pointerId)
    document.body.classList.remove('cv-panel-resizing')
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const workspace = workspaceFor(event.currentTarget)
    if (!workspace) return
    const growKey = side === 'left' ? 'ArrowRight' : 'ArrowLeft'
    const shrinkKey = side === 'left' ? 'ArrowLeft' : 'ArrowRight'
    let nextWidth: number | null = null
    if (event.key === growKey) nextWidth = width + KEYBOARD_STEP
    if (event.key === shrinkKey) nextWidth = width - KEYBOARD_STEP
    if (event.key === 'Home') nextWidth = panelBounds(workspace).min
    if (event.key === 'End') nextWidth = panelBounds(workspace).max
    if (nextWidth === null) return
    event.preventDefault()
    onResize(clampWidth(nextWidth, workspace))
  }

  return <div
    className={`cv-panel-resize-handle cv-panel-resize-handle--${side}`}
    role="separator"
    aria-label={`Redimensionner le panneau ${side === 'left' ? 'de navigation' : 'Sorties'}`}
    aria-orientation="vertical"
    aria-valuemin={MIN_PANEL_WIDTH}
    aria-valuemax={MAX_PANEL_WIDTH}
    aria-valuenow={Math.round(width)}
    tabIndex={0}
    onPointerDown={handlePointerDown}
    onPointerMove={handlePointerMove}
    onPointerUp={stopDragging}
    onPointerCancel={stopDragging}
    onKeyDown={handleKeyDown}
  />
}
