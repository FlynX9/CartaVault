import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { listAccessibleTrips } from '../../api/trips'
import type { PoiMap } from '../../types/map'
import { MapContextNavigation } from './MapContextNavigation'

vi.mock('../../api/trips', () => ({ listAccessibleTrips: vi.fn() }))

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
  beforeEach(() => vi.mocked(listAccessibleTrips).mockResolvedValue([]))

  it('identifies the map and switches contextual modules', () => {
    const onPanelChange = vi.fn()
    const onMapChange = vi.fn()
     render(<MapContextNavigation poiMap={poiMap} maps={[poiMap, belgiumMap]} activePanel="places" tripPlanningActive={false} onMapChange={onMapChange} onPanelChange={onPanelChange} onImport={vi.fn()} onExport={vi.fn()} onSettings={vi.fn()} onMembers={vi.fn()} />)
    expect(screen.queryByRole('button', { name: 'Retour aux cartes' })).not.toBeInTheDocument()
    expect(screen.getByText('Carnet de France')).toBeInTheDocument()
    expect(screen.getByText('France')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Choisir une carte' }))
    const belgiumOption = screen.getByRole('option', { name: /Escapade belge/ })
    expect(belgiumOption.querySelector('img')).toHaveAttribute('src', 'https://flagcdn.com/be.svg')
    fireEvent.click(belgiumOption)
    expect(onMapChange).toHaveBeenCalledWith('map-2')
     expect(screen.queryByRole('button', { name: 'Lieux' })).not.toBeInTheDocument()
     expect(screen.queryByRole('button', { name: 'Sorties' })).not.toBeInTheDocument()
     expect(screen.queryByRole('button', { name: 'Chronologie' })).not.toBeInTheDocument()
     expect(document.getElementById('map-context-toolbar-slot')).toBeInTheDocument()

    const organization = screen.getByRole('button', { name: 'Organisation' })
    fireEvent.click(organization)
    fireEvent.click(screen.getByRole('menuitem', { name: 'Tags' }))
    expect(onPanelChange).toHaveBeenCalledWith('tags')
  })

  it('shows independently managed Places, Trips and Timeline tabs on the trip screen', () => {
    const onTripTimelineToggle = vi.fn()
    const onTripScreenPanelChange = vi.fn()
    const props = { poiMap, maps: [poiMap], activePanel: 'trip' as const, tripPlanningActive: true, tripScreenActive: true, onMapChange: vi.fn(), onPanelChange: vi.fn(), onOpenTrips: vi.fn(), onTripTimelineToggle, onTripScreenPanelChange, onImport: vi.fn(), onExport: vi.fn(), onSettings: vi.fn(), onMembers: vi.fn() }
    const { rerender } = render(<MapContextNavigation {...props} tripTimelineActive />)
    expect(screen.queryByRole('button', { name: 'Organisation' })).not.toBeInTheDocument()

      const places = screen.getByRole('button', { name: 'Lieux' })
      expect(screen.getByRole('button', { name: 'Sorties' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Chronologie' })).toBeInTheDocument()
     expect(places).toHaveAttribute('aria-pressed', 'false')
    expect(places).toBeEnabled()
      expect(screen.getByRole('button', { name: 'Sorties' })).toBeEnabled()
      expect(screen.getByRole('button', { name: 'Sorties' })).toHaveAttribute('aria-pressed', 'false')
      expect(places).toHaveClass('map-context-navigation__tab--panel-toggle')
      rerender(<MapContextNavigation {...props} tripScreenPanels={{ places: true, trip: true }} tripTimelineActive={false} />)
      expect(places).toBeEnabled()
      expect(places).toHaveAttribute('aria-pressed', 'true')
      expect(screen.getByRole('button', { name: 'Sorties' })).toHaveAttribute('aria-pressed', 'true')
      fireEvent.click(screen.getByRole('button', { name: 'Sorties' }))
      expect(screen.getByRole('button', { name: 'Sorties' })).toHaveClass('map-context-navigation__tab--panel-toggle')
      expect(onTripScreenPanelChange).toHaveBeenCalledWith('trip')
      rerender(<MapContextNavigation {...props} tripTimelineActive={false} />)
      expect(screen.getByRole('button', { name: 'Sorties' })).toHaveAttribute('aria-pressed', 'true')
      fireEvent.click(screen.getByRole('button', { name: 'Sorties' }))
      expect(onTripScreenPanelChange).toHaveBeenCalledWith('trip')
    const toolbarSlot = document.getElementById('map-context-toolbar-slot')
    expect(toolbarSlot?.parentElement?.nextElementSibling).toContainElement(screen.getByRole('button', { name: 'Actions de la carte' }))
  })

  it('selects from the same global trip list as Mes Sorties', async () => {
    const onTripSelect = vi.fn()
    vi.mocked(listAccessibleTrips).mockResolvedValue([
      { id: 'trip-1', map_id: poiMap.id, map_name: poiMap.name, country_name: 'France', country_code: 'FR', name: 'Séjour en France', start_date: null, end_date: null, status: 'draft', created_at: '', updated_at: '', day_count: 0, stop_count: 0, thumbnail_photo_id: null },
      { id: 'trip-2', map_id: belgiumMap.id, map_name: belgiumMap.name, country_name: 'Belgique', country_code: 'BE', name: 'Week-end belge', start_date: null, end_date: null, status: 'draft', created_at: '', updated_at: '', day_count: 0, stop_count: 0, thumbnail_photo_id: null },
    ])
    render(<MapContextNavigation poiMap={poiMap} maps={[poiMap, belgiumMap]} activePanel="trip" tripPlanningActive tripScreenActive activeTrip={{ id: 'trip-1', name: 'Séjour en France' }} onTripSelect={onTripSelect} onMapChange={vi.fn()} onPanelChange={vi.fn()} onImport={vi.fn()} onExport={vi.fn()} onSettings={vi.fn()} onMembers={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: 'Choisir un voyage' }))
    const option = await screen.findByRole('option', { name: /Week-end belge/ })
    expect(option.querySelector('img')).toHaveAttribute('src', 'https://flagcdn.com/be.svg')
    fireEvent.click(option)
    expect(onTripSelect).toHaveBeenCalledWith('trip-2')
  })

  it('hides the timeline toggle when the map has no trip', () => {
    render(<MapContextNavigation poiMap={{ ...poiMap, trip_count: 0 }} maps={[poiMap]} activePanel="trip" tripPlanningActive tripScreenActive tripTimelineAvailable={false} onMapChange={vi.fn()} onPanelChange={vi.fn()} onOpenTrips={vi.fn()} onImport={vi.fn()} onExport={vi.fn()} onSettings={vi.fn()} onMembers={vi.fn()} />)

    expect(screen.queryByRole('button', { name: 'Chronologie' })).not.toBeInTheDocument()
  })

  it('hides all trip tabs when the trip is closed', () => {
    const onTripTimelineToggle = vi.fn()
    render(<MapContextNavigation poiMap={poiMap} maps={[poiMap]} activePanel="places" tripPlanningActive={false} tripTimelineAvailable onMapChange={vi.fn()} onPanelChange={vi.fn()} onOpenTrips={vi.fn()} onTripTimelineToggle={onTripTimelineToggle} onImport={vi.fn()} onExport={vi.fn()} onSettings={vi.fn()} onMembers={vi.fn()} />)

    expect(screen.queryByRole('button', { name: 'Lieux' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Sorties' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Chronologie' })).not.toBeInTheDocument()
    expect(onTripTimelineToggle).not.toHaveBeenCalled()
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

  it('shows right-aligned toggles for map tools, legend and country mask', () => {
    const onMapToolsPanelToggle = vi.fn()
    const onLegendPanelToggle = vi.fn()
    const onCountryMaskToggle = vi.fn()
    render(<MapContextNavigation poiMap={poiMap} maps={[poiMap]} activePanel="places" tripPlanningActive={false} mapToolsPanelOpen legendPanelOpen={false} countryMaskEnabled onMapChange={vi.fn()} onPanelChange={vi.fn()} onOpenTrips={vi.fn()} onImport={vi.fn()} onExport={vi.fn()} onSettings={vi.fn()} onMembers={vi.fn()} onMapToolsPanelToggle={onMapToolsPanelToggle} onLegendPanelToggle={onLegendPanelToggle} onCountryMaskToggle={onCountryMaskToggle} />)

    fireEvent.click(screen.getByRole('button', { name: 'Actions de la carte' }))
    const tools = screen.getByRole('menuitemcheckbox', { name: 'Outils cartographiques' })
    const legend = screen.getByRole('menuitemcheckbox', { name: 'Légende' })
    const mask = screen.getByRole('menuitemcheckbox', { name: 'Masque de pays' })
    expect(tools).toHaveAttribute('aria-checked', 'true')
    expect(legend).toHaveAttribute('aria-checked', 'false')
    expect(mask).toHaveAttribute('aria-checked', 'true')
    expect(tools.querySelector('i')).toBeInTheDocument()
    expect(legend.querySelector('i')).toBeInTheDocument()
    expect(mask.querySelector('i')).toBeInTheDocument()
    fireEvent.click(tools)
    fireEvent.click(legend)
    fireEvent.click(mask)
    expect(onMapToolsPanelToggle).toHaveBeenCalledOnce()
    expect(onLegendPanelToggle).toHaveBeenCalledOnce()
    expect(onCountryMaskToggle).toHaveBeenCalledOnce()
  })

  it('hides management actions from a read-only map', () => {
    render(<MapContextNavigation poiMap={{ ...poiMap, can_edit: false, can_export: false, can_import: false, can_manage_members: false }} maps={[poiMap]} activePanel="places" tripPlanningActive={false} onMapChange={vi.fn()} onPanelChange={vi.fn()} onOpenTrips={vi.fn()} onImport={vi.fn()} onExport={vi.fn()} onSettings={vi.fn()} onMembers={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Actions de la carte' }))
    expect(screen.getByRole('menuitemcheckbox', { name: 'Outils cartographiques' })).toBeInTheDocument()
    expect(screen.getByRole('menuitemcheckbox', { name: 'Légende' })).toBeInTheDocument()
    expect(screen.getByRole('menuitemcheckbox', { name: 'Masque de pays' })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'Champs des POI' })).not.toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'Membres' })).not.toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'Importer un fichier KMZ' })).not.toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: /Exporter/ })).not.toBeInTheDocument()
  })
})
