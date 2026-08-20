import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { PoiMap } from '../../types/map'
import { MapContextNavigation } from './MapContextNavigation'

const poiMap: PoiMap = {
  id: 'map-1', name: 'Carnet de France', country_id: 'fr', country: { id: 'fr', iso_alpha2: 'FR', iso_alpha3: 'FRA', name: 'France' },
  center_latitude: null, center_longitude: null, default_zoom: null, effective_center_latitude: 46, effective_center_longitude: 2,
  effective_default_zoom: 6, min_latitude: null, max_latitude: null, min_longitude: null, max_longitude: null,
  created_at: '', updated_at: '', place_count: 3, trip_count: 1, can_edit: true, can_export: true, can_import: true, can_manage_members: true,
}
const belgiumMap: PoiMap = {
  ...poiMap,
  id: 'map-2',
  name: 'Escapade belge',
  country_id: 'be',
  country: { id: 'be', iso_alpha2: 'BE', iso_alpha3: 'BEL', name: 'Belgique' },
}

describe('MapContextNavigation', () => {
  afterEach(cleanup)

  it('identifies the map and switches contextual modules', () => {
    const onPanelChange = vi.fn()
    const onOpenTrips = vi.fn()
    const onMapChange = vi.fn()
    render(<MapContextNavigation poiMap={poiMap} maps={[poiMap, belgiumMap]} activePanel="places" tripPlanningActive={false} onMapChange={onMapChange} onPanelChange={onPanelChange} onOpenTrips={onOpenTrips} onImport={vi.fn()} onExport={vi.fn()} onSettings={vi.fn()} onMembers={vi.fn()} />)
    expect(screen.queryByRole('button', { name: 'Retour aux cartes' })).not.toBeInTheDocument()
    expect(screen.getByText('Carnet de France')).toBeInTheDocument()
    expect(screen.getByText('France')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Choisir une carte' }))
    const belgiumOption = screen.getByRole('option', { name: /Escapade belge/ })
    expect(belgiumOption.querySelector('img')).toHaveAttribute('src', 'https://flagcdn.com/be.svg')
    fireEvent.click(belgiumOption)
    expect(onMapChange).toHaveBeenCalledWith('map-2')
    expect(screen.getByRole('button', { name: 'Lieux' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'Lieux' }))
    expect(onPanelChange).toHaveBeenCalledWith(null)
    fireEvent.click(screen.getByRole('button', { name: 'Sorties' }))
    expect(onOpenTrips).toHaveBeenCalledOnce()

    const organization = screen.getByRole('button', { name: 'Organisation' })
    expect(organization).toHaveTextContent(/^Organisation$/)
    fireEvent.click(organization)
    fireEvent.click(screen.getByRole('menuitem', { name: 'Tags' }))
    expect(onPanelChange).toHaveBeenCalledWith('tags')
  })

  it('shows Places and Sorties as independent panel toggles', () => {
    render(<MapContextNavigation poiMap={poiMap} maps={[poiMap]} activePanel="places" tripPlanningActive onMapChange={vi.fn()} onPanelChange={vi.fn()} onOpenTrips={vi.fn()} onImport={vi.fn()} onExport={vi.fn()} onSettings={vi.fn()} onMembers={vi.fn()} />)

    const places = screen.getByRole('button', { name: 'Lieux' })
    const trips = screen.getByRole('button', { name: 'Sorties' })
    expect(places).toHaveAttribute('aria-pressed', 'true')
    expect(trips).toHaveAttribute('aria-pressed', 'true')
    expect(places).toHaveClass('map-context-navigation__tab--panel-toggle')
    expect(trips).toHaveClass('map-context-navigation__tab--panel-toggle')
    expect(screen.getByRole('button', { name: 'Organisation' })).not.toHaveClass('map-context-navigation__tab--panel-toggle')
  })

  it('exposes real map actions according to permissions', () => {
    const onImport = vi.fn()
    const onExport = vi.fn()
    const onSettings = vi.fn()
    const onMembers = vi.fn()
    render(<MapContextNavigation poiMap={poiMap} maps={[poiMap]} activePanel="places" tripPlanningActive={false} onMapChange={vi.fn()} onPanelChange={vi.fn()} onOpenTrips={vi.fn()} onImport={onImport} onExport={onExport} onSettings={onSettings} onMembers={onMembers} />)
    fireEvent.click(screen.getByRole('button', { name: 'Actions de la carte' }))
    expect(screen.getByRole('menuitem', { name: 'Champs des POI' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Membres' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Importer un fichier KMZ' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Exporter Carnet de France' }))
    expect(onExport).toHaveBeenCalledOnce()
  })

  it('hides management actions from a read-only map', () => {
    render(<MapContextNavigation poiMap={{ ...poiMap, can_edit: false, can_export: false, can_import: false, can_manage_members: false }} maps={[poiMap]} activePanel="places" tripPlanningActive={false} onMapChange={vi.fn()} onPanelChange={vi.fn()} onOpenTrips={vi.fn()} onImport={vi.fn()} onExport={vi.fn()} onSettings={vi.fn()} onMembers={vi.fn()} />)
    expect(screen.queryByRole('button', { name: 'Actions de la carte' })).not.toBeInTheDocument()
  })
})
