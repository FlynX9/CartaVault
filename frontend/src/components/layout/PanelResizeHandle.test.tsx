import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { PanelResizeHandle } from './PanelResizeHandle'

afterEach(() => {
  cleanup()
  document.body.classList.remove('cv-panel-resizing')
})

function renderHandle(
  side: 'left' | 'right',
  width: number,
  onResize = vi.fn(),
  growDirection?: 'left' | 'right',
) {
  const result = render(<div className="map-workspace"><PanelResizeHandle side={side} growDirection={growDirection} width={width} onResize={onResize} /></div>)
  const workspace = result.container.querySelector<HTMLElement>('.map-workspace')!
  Object.defineProperty(workspace, 'clientWidth', { configurable: true, value: 1200 })
  return { ...result, onResize, workspace }
}

describe('PanelResizeHandle', () => {
  it('resizes the left panel with the keyboard', () => {
    const { onResize } = renderHandle('left', 430)
    const separator = screen.getByRole('separator', { name: 'Redimensionner le panneau de navigation' })

    fireEvent.keyDown(separator, { key: 'ArrowRight' })
    expect(onResize).toHaveBeenLastCalledWith(454)
    fireEvent.keyDown(separator, { key: 'Home' })
    expect(onResize).toHaveBeenLastCalledWith(320)
    fireEvent.keyDown(separator, { key: 'End' })
    expect(onResize).toHaveBeenLastCalledWith(720)
  })

  it('uses the mirrored keyboard direction for the right panel', () => {
    const { onResize } = renderHandle('right', 640)
    const separator = screen.getByRole('separator', { name: 'Redimensionner le panneau Sorties' })

    fireEvent.keyDown(separator, { key: 'ArrowLeft' })
    expect(onResize).toHaveBeenCalledWith(664)
  })

  it('grows a left-docked trip panel when its right edge moves right', () => {
    const { onResize } = renderHandle('right', 640, vi.fn(), 'right')
    const separator = screen.getByRole('separator', { name: 'Redimensionner le panneau Sorties' })

    fireEvent.keyDown(separator, { key: 'ArrowRight' })
    expect(onResize).toHaveBeenCalledWith(664)
    fireEvent.keyDown(separator, { key: 'ArrowLeft' })
    expect(onResize).toHaveBeenLastCalledWith(616)
  })

  it('grows the left-docked trip panel to the right and coalesces pointer updates', () => {
    const onResize = vi.fn()
    const onResizeCommit = vi.fn()
    const result = render(<div className="map-workspace"><PanelResizeHandle side="right" growDirection="right" width={430} onResize={onResize} onResizeCommit={onResizeCommit} /></div>)
    const workspace = result.container.querySelector<HTMLElement>('.map-workspace')!
    Object.defineProperty(workspace, 'clientWidth', { configurable: true, value: 1200 })
    vi.spyOn(workspace, 'getBoundingClientRect').mockReturnValue({ width: 1200 } as DOMRect)
    let animationFrame: FrameRequestCallback | undefined
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      animationFrame = callback
      return 1
    })
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined)
    const separator = screen.getByRole('separator', { name: 'Redimensionner le panneau Sorties' })

    fireEvent.pointerDown(separator, { pointerId: 1, clientX: 100 })
    fireEvent.pointerMove(separator, { pointerId: 1, clientX: 130 })
    fireEvent.pointerMove(separator, { pointerId: 1, clientX: 160 })
    expect(onResize).not.toHaveBeenCalled()
    animationFrame?.(0)
    expect(onResize).toHaveBeenCalledTimes(1)
    expect(onResize).toHaveBeenLastCalledWith(490)

    fireEvent.pointerMove(separator, { pointerId: 1, clientX: 170 })
    fireEvent.pointerUp(separator, { pointerId: 1, clientX: 170 })
    expect(onResize).toHaveBeenLastCalledWith(500)
    expect(onResizeCommit).toHaveBeenCalledWith(500)
  })
})
