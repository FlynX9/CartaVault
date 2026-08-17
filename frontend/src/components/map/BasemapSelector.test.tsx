import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { BasemapSelector } from './BasemapSelector'

afterEach(cleanup)

describe('BasemapSelector', () => {
  it('shows only the OSM light choice by default', () => {
    render(<BasemapSelector activeBasemapId="osm" onBasemapChange={vi.fn()} />)
    const selector = screen.getByRole('group', { name: 'Fond cartographique' })
    expect(selector).toHaveClass('basemap-selector--count-1')
    expect(screen.getByRole('button', { name: 'Utiliser le fond OpenStreetMap Standard' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.mouseEnter(selector)
    expect(screen.getAllByRole('button')).toHaveLength(1)
  })

  it('shows Stadia light and dark, plus the configured satellite provider', () => {
    const onBasemapChange = vi.fn()
    render(<BasemapSelector activeBasemapId="stadia-light" onBasemapChange={onBasemapChange} classicProvider="stadia" satelliteProvider="mapbox" />)
    const selector = screen.getByRole('group', { name: 'Fond cartographique' })
    expect(selector).toHaveClass('basemap-selector--count-3')
    fireEvent.mouseEnter(selector)
    expect(screen.getAllByRole('button')).toHaveLength(3)
    fireEvent.click(screen.getByRole('button', { name: 'Utiliser le fond Stadia sombre' }))
    expect(onBasemapChange).toHaveBeenCalledWith('stadia-dark')
  })

  it.each([
    ['stadia', 'Stadia satellite'],
    ['google', 'Google Satellite (Maps JavaScript)'],
    ['mapbox', 'Mapbox Satellite'],
  ] as const)('shows the %s satellite choice when configured', (satelliteProvider, label) => {
    render(<BasemapSelector activeBasemapId="osm" onBasemapChange={vi.fn()} satelliteProvider={satelliteProvider} />)
    fireEvent.focus(screen.getByRole('button', { name: 'Utiliser le fond OpenStreetMap Standard' }))
    expect(screen.getByRole('button', { name: `Utiliser le fond ${label}` })).toBeVisible()
  })

  it('shows the Map Tiles variant when it is selected for Google Satellite', () => {
    render(<BasemapSelector activeBasemapId="osm" onBasemapChange={vi.fn()} satelliteProvider="google" googleSatelliteMode="map-tiles" />)
    fireEvent.focus(screen.getByRole('button', { name: 'Utiliser le fond OpenStreetMap Standard' }))
    expect(screen.getByRole('button', { name: 'Utiliser le fond Google Satellite (Map Tiles)' })).toBeVisible()
  })

  it('shows Google normal as the only classic Google choice', () => {
    render(<BasemapSelector activeBasemapId="google-roadmap" onBasemapChange={vi.fn()} classicProvider="google" />)
    expect(screen.getByRole('group', { name: 'Fond cartographique' })).toHaveClass('basemap-selector--count-1')
    fireEvent.click(screen.getByRole('button', { name: 'Utiliser le fond Google' }))
    expect(screen.getAllByRole('button')).toHaveLength(1)
  })

  it('never renders a fourth choice while recovering from an unavailable provider', () => {
    render(<BasemapSelector activeBasemapId="osm" onBasemapChange={vi.fn()} classicProvider="stadia" satelliteProvider="google" />)
    const selector = screen.getByRole('group', { name: 'Fond cartographique' })
    fireEvent.mouseEnter(selector)
    expect(selector).toHaveClass('basemap-selector--count-3')
    expect(screen.getAllByRole('button')).toHaveLength(3)
  })

  it('does not render while CartaVault is active offline', () => {
    render(<BasemapSelector activeBasemapId="cartavault-light" onBasemapChange={vi.fn()} offline />)
    expect(screen.queryByRole('group', { name: 'Fond cartographique' })).not.toBeInTheDocument()
  })
})
