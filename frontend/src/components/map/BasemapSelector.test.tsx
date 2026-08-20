import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { BasemapSelector } from './BasemapSelector'

afterEach(cleanup)

describe('BasemapSelector', () => {
  it('shows CartaVault light and dark choices when CartaVault is configured', () => {
    render(<BasemapSelector activeBasemapId="cartavault-light" mapTheme="light" onBasemapChange={vi.fn()} classicProvider="cartavault" />)
    const selector = screen.getByRole('region', { name: 'Fond cartographique' })
    expect(selector).toHaveClass('basemap-selector--count-2')
    expect(screen.getByRole('button', { name: /Th.me de carte/ }).querySelector('svg')).toHaveClass('lucide-sun')
    fireEvent.click(screen.getByRole('button', { name: /Th.me de carte/ }))
    expect(screen.getByRole('button', { name: 'Utiliser le fond CartaVault clair' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Utiliser le fond CartaVault sombre' })).toBeVisible()
  })

  it('selects CartaVault dark and updates the active toggle icon to Moon', () => {
    const onBasemapChange = vi.fn()
    const { rerender } = render(<BasemapSelector activeBasemapId="cartavault-light" mapTheme="light" onBasemapChange={onBasemapChange} classicProvider="cartavault" />)
    fireEvent.click(screen.getByRole('button', { name: /Th.me de carte/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Utiliser le fond CartaVault sombre' }))
    expect(onBasemapChange).toHaveBeenCalledWith('cartavault-dark')

    rerender(<BasemapSelector activeBasemapId="cartavault-dark" mapTheme="dark" onBasemapChange={onBasemapChange} classicProvider="cartavault" />)
    expect(screen.getByRole('button', { name: /Th.me de carte/ }).querySelector('svg')).toHaveClass('lucide-moon')
    fireEvent.click(screen.getByRole('button', { name: /Th.me de carte/ }))
    expect(screen.getByRole('button', { name: 'Utiliser le fond CartaVault sombre' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('selects CartaVault light and updates the active toggle icon after a dark theme', () => {
    const onBasemapChange = vi.fn()
    const { rerender } = render(<BasemapSelector activeBasemapId="cartavault-dark" mapTheme="dark" onBasemapChange={onBasemapChange} classicProvider="cartavault" />)
    fireEvent.click(screen.getByRole('button', { name: /Th.me de carte/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Utiliser le fond CartaVault clair' }))
    expect(onBasemapChange).toHaveBeenCalledWith('cartavault-light')

    rerender(<BasemapSelector activeBasemapId="cartavault-light" mapTheme="light" onBasemapChange={onBasemapChange} classicProvider="cartavault" />)
    expect(screen.getByRole('button', { name: /Th.me de carte/ }).querySelector('svg')).toHaveClass('lucide-sun')
  })

  it('applies a pointer choice before the toolbar closes the popover', () => {
    const onBasemapChange = vi.fn()
    render(<BasemapSelector activeBasemapId="cartavault-dark" mapTheme="dark" onBasemapChange={onBasemapChange} classicProvider="cartavault" />)
    fireEvent.click(screen.getByRole('button', { name: /Th.me de carte/ }))

    fireEvent.pointerDown(screen.getByRole('button', { name: 'Utiliser le fond CartaVault clair' }))

    expect(onBasemapChange).toHaveBeenCalledWith('cartavault-light')
  })

  it('shows Stadia light and dark, plus the configured satellite provider', () => {
    const onBasemapChange = vi.fn()
    render(<BasemapSelector activeBasemapId="stadia-light" mapTheme="light" onBasemapChange={onBasemapChange} classicProvider="stadia" satelliteProvider="mapbox" />)
    const selector = screen.getByRole('region', { name: 'Fond cartographique' })
    expect(selector).toHaveClass('basemap-selector--count-3')
    fireEvent.mouseEnter(selector)
    expect(screen.getAllByRole('button')).toHaveLength(4)
    fireEvent.click(screen.getByRole('button', { name: 'Utiliser le fond Stadia sombre' }))
    expect(onBasemapChange).toHaveBeenCalledWith('stadia-dark')
  })

  it.each([
    ['stadia', 'Stadia satellite'],
    ['google', 'Google Satellite (Maps JavaScript)'],
    ['mapbox', 'Mapbox Satellite'],
  ] as const)('shows the %s satellite choice when configured', (satelliteProvider, label) => {
    render(<BasemapSelector activeBasemapId="osm" mapTheme="light" onBasemapChange={vi.fn()} satelliteProvider={satelliteProvider} />)
    fireEvent.focus(screen.getByRole('button', { name: /Th.me de carte/ }))
    expect(screen.getByRole('button', { name: `Utiliser le fond ${label}` })).toBeVisible()
  })

  it('shows the Map Tiles variant when it is selected for Google Satellite', () => {
    render(<BasemapSelector activeBasemapId="osm" mapTheme="light" onBasemapChange={vi.fn()} satelliteProvider="google" googleSatelliteMode="map-tiles" />)
    fireEvent.focus(screen.getByRole('button', { name: /Th.me de carte/ }))
    expect(screen.getByRole('button', { name: 'Utiliser le fond Google Satellite (Map Tiles)' })).toBeVisible()
  })

  it('shows Google normal as the only classic Google choice', () => {
    render(<BasemapSelector activeBasemapId="google-roadmap" mapTheme="light" onBasemapChange={vi.fn()} classicProvider="google" />)
    expect(screen.getByRole('region', { name: 'Fond cartographique' })).toHaveClass('basemap-selector--count-1')
    fireEvent.click(screen.getByRole('button', { name: /Th.me de carte/ }))
    expect(screen.getAllByRole('button')).toHaveLength(2)
  })

  it('does not add the fallback renderer to the configured choices', () => {
    render(<BasemapSelector activeBasemapId="osm" mapTheme="light" onBasemapChange={vi.fn()} classicProvider="stadia" satelliteProvider="google" />)
    const selector = screen.getByRole('region', { name: 'Fond cartographique' })
    fireEvent.mouseEnter(selector)
    expect(selector).toHaveClass('basemap-selector--count-3')
    expect(screen.getAllByRole('button')).toHaveLength(4)
  })

  it('does not render while CartaVault is active offline', () => {
    render(<BasemapSelector activeBasemapId="cartavault-light" mapTheme="light" onBasemapChange={vi.fn()} classicProvider="cartavault" offline />)
    expect(screen.queryByRole('region', { name: 'Fond cartographique' })).not.toBeInTheDocument()
  })
})
