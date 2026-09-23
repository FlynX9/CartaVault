import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'

import type { PoiMap } from '../../types/map'
import { MobileNavigation } from './MobileNavigation'

const map = { id: 'map-1', name: 'France', country: { iso_alpha2: 'FR' } } as PoiMap
const globalMode = { kind: 'GLOBAL_MODE', rememberedMapId: 'map-1' } as const
const mapMode = { kind: 'MAP_MODE', mapId: map.id, map } as const

describe('MobileNavigation', () => {
  afterEach(() => cleanup())

  it('is an explicit mobile navigation tree and receives GLOBAL_MODE', () => {
    render(<MemoryRouter><MobileNavigation navigationMode={globalMode} activePanel="places" onPanelChange={vi.fn()} activeMapId="map-1" maps={[map]} /></MemoryRouter>)

    const navigation = screen.getByRole('navigation', { name: 'Navigation CartaVault' })
    expect(navigation).toHaveClass('mobile-navigation', 'is-mobile')
    expect(navigation).toHaveAttribute('data-navigation-mode', 'GLOBAL_MODE')
    expect(screen.queryByRole('button', { name: map.name })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Réduire le menu' })).not.toBeInTheDocument()
  })

  it('renders the validated map from MAP_MODE instead of activeMapId', () => {
    const onMapNavigation = vi.fn()
    render(<MemoryRouter><MobileNavigation navigationMode={mapMode} activePanel="places" onPanelChange={vi.fn()} onMapNavigation={onMapNavigation} activeMapId="stale-map" maps={[map]} /></MemoryRouter>)
    const navigation = screen.getByRole('navigation', { name: 'Navigation CartaVault' })

    expect(navigation).toHaveAttribute('data-navigation-mode', 'MAP_MODE')
    expect(navigation).toHaveAttribute('data-navigation-map-id', map.id)
    expect(within(navigation).getAllByRole('button')).toHaveLength(4)
    expect(screen.getByRole('button', { name: 'Lieux' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Carte' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: 'Sorties' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: 'Plus' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.queryByRole('button', { name: 'Accueil' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Mes Cartes' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Médias' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Corbeille' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Carte' }))
    expect(onMapNavigation).toHaveBeenCalledWith('map', map.id)
    fireEvent.click(screen.getByRole('button', { name: 'Sorties' }))
    expect(onMapNavigation).toHaveBeenCalledWith('trips', map.id)
    fireEvent.click(screen.getByRole('button', { name: 'Plus' }))
    expect(screen.getByRole('menu', { name: 'Actions de la carte' })).toHaveAttribute('data-map-id', map.id)
    expect(screen.getByRole('button', { name: 'Plus' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'Lieux' }))
    expect(onMapNavigation).toHaveBeenCalledWith('places', map.id)
  })

  it('renders exactly four global destinations and no contextual entries', () => {
    const onPanelChange = vi.fn()
    const { rerender } = render(<MemoryRouter><MobileNavigation navigationMode={globalMode} activePanel="media" onPanelChange={onPanelChange} activeMapId="map-1" activeTrip={{ id: 'trip-1', name: 'Sortie stale', map_id: map.id }} maps={[map]} organizationAvailable /></MemoryRouter>)
    const navigation = screen.getByRole('navigation', { name: 'Navigation CartaVault' })

    expect(within(navigation).getAllByRole('button')).toHaveLength(4)
    expect(screen.getByRole('button', { name: 'Accueil' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: 'Mes Cartes' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: 'Médias' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Corbeille' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.queryByRole('button', { name: 'Mes Sorties' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Organisation' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: map.name })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Corbeille' }))
    expect(onPanelChange).toHaveBeenCalledWith('trash')

    rerender(<MemoryRouter><MobileNavigation navigationMode={globalMode} activePanel="trash" onPanelChange={onPanelChange} organizationAvailable /></MemoryRouter>)
    expect(screen.getByRole('button', { name: 'Corbeille' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Médias' })).toHaveAttribute('aria-pressed', 'false')
  })
})
