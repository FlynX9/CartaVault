import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { BasemapSelector } from './BasemapSelector'

afterEach(cleanup)

describe('BasemapSelector', () => {
  it('always exposes OpenFreeMap light and dark without exposing OSM fallback', () => {
    render(<BasemapSelector activeBasemapId="openfreemap-light" mapTheme="light" onBasemapChange={vi.fn()} satelliteProvider="none" />)
    const selector = screen.getByRole('region', { name: 'Fond cartographique' })
    expect(selector).toHaveClass('basemap-selector--count-2')
    const toggle = screen.getByRole('button', { name: 'Thème de carte' })
    expect(toggle.querySelector('svg')).toHaveClass('lucide-layers')
    expect(toggle).toHaveTextContent('Thème de carte')
    expect(toggle.querySelector('.basemap-selector__chevron')).toHaveClass('lucide-chevron-down')
    fireEvent.click(toggle)
    expect(screen.getByRole('button', { name: 'Utiliser le fond OpenFreeMap clair' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Utiliser le fond OpenFreeMap sombre' })).toBeVisible()
    expect(screen.queryByRole('button', { name: /OpenStreetMap/ })).not.toBeInTheDocument()
  })

  it.each([
    ['arcgis', 'ArcGIS World Imagery'],
    ['google', 'Google Satellite'],
  ] as const)('adds only the configured %s satellite renderer', (provider, label) => {
    render(<BasemapSelector activeBasemapId="openfreemap-light" mapTheme="light" onBasemapChange={vi.fn()} satelliteProvider={provider} />)
    fireEvent.click(screen.getByRole('button', { name: 'Thème de carte' }))
    expect(screen.getByRole('button', { name: `Utiliser le fond ${label}` })).toBeVisible()
    expect(screen.getByRole('region', { name: 'Fond cartographique' })).toHaveClass('basemap-selector--count-3')
  })

  it('selects the dark renderer and closes the options', () => {
    const onBasemapChange = vi.fn()
    render(<BasemapSelector activeBasemapId="openfreemap-light" mapTheme="light" onBasemapChange={onBasemapChange} />)
    fireEvent.click(screen.getByRole('button', { name: 'Thème de carte' }))
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Utiliser le fond OpenFreeMap sombre' }))
    expect(onBasemapChange).toHaveBeenCalledWith('openfreemap-dark')
  })

  it('closes when clicking outside the selector', () => {
    render(<><BasemapSelector activeBasemapId="openfreemap-light" mapTheme="light" onBasemapChange={vi.fn()} /><button type="button">Extérieur</button></>)
    fireEvent.click(screen.getByRole('button', { name: 'Thème de carte' }))
    expect(screen.getByRole('button', { name: 'Utiliser le fond OpenFreeMap clair' })).toBeInTheDocument()
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Extérieur' }))
    expect(screen.queryByRole('button', { name: 'Utiliser le fond OpenFreeMap clair' })).not.toBeInTheDocument()
  })

  it('does not render in offline mode', () => {
    render(<BasemapSelector activeBasemapId="offline-vector-light" mapTheme="light" onBasemapChange={vi.fn()} offline />)
    expect(screen.queryByRole('region', { name: 'Fond cartographique' })).not.toBeInTheDocument()
  })
})
