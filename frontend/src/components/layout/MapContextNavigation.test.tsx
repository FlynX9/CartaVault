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

describe('MapContextNavigation', () => {
  afterEach(cleanup)

  it('identifies the map and switches contextual modules', () => {
    const onPanelChange = vi.fn()
    const onOpenTrips = vi.fn()
    render(<MapContextNavigation poiMap={poiMap} activePanel="places" tripPlanningActive={false} onBackToMaps={vi.fn()} onPanelChange={onPanelChange} onOpenTrips={onOpenTrips} onImport={vi.fn()} onExport={vi.fn()} onSettings={vi.fn()} onMembers={vi.fn()} />)
    expect(screen.getByText('Carnet de France')).toBeInTheDocument()
    expect(screen.getByText('France')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Lieux' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'Sorties' }))
    expect(onOpenTrips).toHaveBeenCalledOnce()

    fireEvent.click(screen.getByRole('button', { name: 'Organisation' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Tags' }))
    expect(onPanelChange).toHaveBeenCalledWith('tags')
  })

  it('exposes real map actions according to permissions', () => {
    const onImport = vi.fn()
    const onExport = vi.fn()
    const onSettings = vi.fn()
    const onMembers = vi.fn()
    render(<MapContextNavigation poiMap={poiMap} activePanel="places" tripPlanningActive={false} onBackToMaps={vi.fn()} onPanelChange={vi.fn()} onOpenTrips={vi.fn()} onImport={onImport} onExport={onExport} onSettings={onSettings} onMembers={onMembers} />)
    fireEvent.click(screen.getByRole('button', { name: 'Actions de la carte' }))
    expect(screen.getByRole('menuitem', { name: 'Champs des POI' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Membres' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Importer un fichier KMZ' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Exporter Carnet de France' }))
    expect(onExport).toHaveBeenCalledOnce()
  })

  it('hides management actions from a read-only map', () => {
    render(<MapContextNavigation poiMap={{ ...poiMap, can_edit: false, can_export: false, can_import: false, can_manage_members: false }} activePanel="places" tripPlanningActive={false} onBackToMaps={vi.fn()} onPanelChange={vi.fn()} onOpenTrips={vi.fn()} onImport={vi.fn()} onExport={vi.fn()} onSettings={vi.fn()} onMembers={vi.fn()} />)
    expect(screen.queryByRole('button', { name: 'Actions de la carte' })).not.toBeInTheDocument()
  })
})
