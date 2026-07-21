import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { PanelResizeHandle } from './PanelResizeHandle'

afterEach(() => {
  cleanup()
  document.body.classList.remove('cv-panel-resizing')
})

function renderHandle(side: 'left' | 'right', width: number, onResize = vi.fn()) {
  const result = render(<div className="map-workspace"><PanelResizeHandle side={side} width={width} onResize={onResize} /></div>)
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
})
