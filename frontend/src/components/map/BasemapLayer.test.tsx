import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { BasemapLayer } from './BasemapLayer'

vi.mock('react-leaflet', () => ({
  TileLayer: ({ url, attribution, maxZoom, eventHandlers }: { url: string; attribution: string; maxZoom: number; eventHandlers: { tileerror: () => void } }) => <button type="button" data-testid="tile-layer" data-url={url} data-attribution={attribution} data-max-zoom={maxZoom} onClick={eventHandlers.tileerror} />,
}))

afterEach(cleanup)

describe('BasemapLayer', () => {
  it('renders exactly the selected registry tile source', () => {
    render(<BasemapLayer basemapId="satellite" onTileError={vi.fn()} />)
    const layer = screen.getByTestId('tile-layer')
    expect(layer).toHaveAttribute('data-url', expect.stringContaining('alidade_satellite'))
    expect(layer).toHaveAttribute('data-max-zoom', '20')
    expect(layer.getAttribute('data-attribution')).toContain('CNES')
  })

  it('identifies the failing source to the fallback controller', () => {
    const onTileError = vi.fn()
    render(<BasemapLayer basemapId="cartavault-dark" onTileError={onTileError} />)
    fireEvent.click(screen.getByTestId('tile-layer'))
    expect(onTileError).toHaveBeenCalledWith('cartavault-dark')
  })
})
