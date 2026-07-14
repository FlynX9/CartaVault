import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { BasemapLayer } from './BasemapLayer'

vi.mock('react-leaflet', () => ({
  TileLayer: ({ url, attribution, maxZoom }: { url: string; attribution: string; maxZoom: number }) => <div data-testid="tile-layer" data-url={url} data-attribution={attribution} data-max-zoom={maxZoom} />,
}))

describe('BasemapLayer', () => {
  it('renders exactly the selected registry tile source', () => {
    render(<BasemapLayer basemapId="satellite" onTileError={vi.fn()} />)
    const layer = screen.getByTestId('tile-layer')
    expect(layer).toHaveAttribute('data-url', expect.stringContaining('alidade_satellite'))
    expect(layer).toHaveAttribute('data-max-zoom', '20')
    expect(layer.getAttribute('data-attribution')).toContain('CNES')
  })
})
