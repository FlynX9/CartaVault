import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { placeSearchService } from '../../geocoding/placeSearchService'
import { GeographicSearch } from './GeographicSearch'

vi.mock('../../geocoding/placeSearchService', () => ({ placeSearchService: { search: vi.fn() } }))

afterEach(cleanup)
beforeEach(() => { vi.mocked(placeSearchService.search).mockReset(); vi.mocked(placeSearchService.search).mockResolvedValue([]) })

describe('GeographicSearch', () => {
  it('starts compact, expands on focus, and collapses after an outside pointer action', () => {
    const { container } = render(<GeographicSearch focus={[48, 2]} selected={null} onSelect={vi.fn()} onClear={vi.fn()} onCreate={vi.fn()} />)
    const search = container.querySelector('.geographic-search')
    const input = screen.getByRole('searchbox', { name: 'Rechercher une adresse ou des coordonnées' })

    expect(search).not.toHaveClass('is-pinned-open')
    expect(screen.getByRole('button', { name: 'Lancer la recherche géographique' }).querySelector('svg')).toBeInTheDocument()

    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: 'Nancy' } })
    expect(search).toHaveClass('is-pinned-open')

    fireEvent.pointerDown(document.body)
    expect(search).not.toHaveClass('is-pinned-open')
    expect(input).toHaveValue('Nancy')
  })

  it('displays city and postal-address results returned by geocoding', async () => {
    vi.mocked(placeSearchService.search).mockResolvedValue([
      { id: 'berlin', name: 'Berlin', formattedAddress: 'Berlin, Allemagne', latitude: 52.52, longitude: 13.4, layer: 'locality', source: 'test' },
      { id: 'address', name: 'Unter den Linden 1', formattedAddress: 'Unter den Linden 1, Berlin', latitude: 52.51, longitude: 13.39, layer: 'address', source: 'test' },
    ])
    render(<GeographicSearch focus={[51, 11]} countryCode="DE" selected={null} onSelect={vi.fn()} onClear={vi.fn()} onCreate={vi.fn()} />)

    fireEvent.change(screen.getByRole('searchbox', { name: 'Rechercher une adresse ou des coordonnées' }), { target: { value: 'Berlin' } })
    fireEvent.click(screen.getByRole('button', { name: 'Lancer la recherche géographique' }))

    expect(await screen.findByText('Berlin, Allemagne')).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /Unter den Linden 1/ })).toBeInTheDocument()
    expect(placeSearchService.search).toHaveBeenCalledWith('Berlin', expect.objectContaining({ countryCode: 'DE', focus: [51, 11] }))
  })

  it('keeps the selected location card available after the search field collapses', () => {
    const onClear = vi.fn()
    const onCreate = vi.fn()
    const { container } = render(<GeographicSearch
      focus={[48, 2]}
      selected={{ id: 'epinal', name: 'Épinal', formattedAddress: 'Épinal, France', latitude: 48.180424, longitude: 6.461278, source: 'test' }}
      onSelect={vi.fn()}
      onClear={onClear}
      onCreate={onCreate}
    />)

    const input = screen.getByRole('searchbox', { name: 'Rechercher une adresse ou des coordonnées' })
    fireEvent.focus(input)
    fireEvent.pointerDown(document.body)

    expect(container.querySelector('.geographic-search')).not.toHaveClass('is-pinned-open')
    expect(screen.getByLabelText('Emplacement géographique sélectionné')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Créer un POI' }))
    fireEvent.click(screen.getByRole('button', { name: 'Effacer' }))
    expect(onCreate).toHaveBeenCalledTimes(1)
    expect(onClear).toHaveBeenCalledTimes(1)
  })

  it('offers the selected trip target on a geographic result', () => {
    const result = { id: 'google:hotel', name: 'Panorama Boutique Hotel', formattedAddress: '13 Samreklo Street, Tbilissi', latitude: 41.697122, longitude: 44.8135, source: 'google_places' }
    const onAddToTrip = vi.fn()
    const onClear = vi.fn()
    render(<GeographicSearch
      focus={[41.7, 44.8]}
      selected={result}
      tripAddTargetLabel="Ajouter à la nuit 1"
      onSelect={vi.fn()}
      onClear={onClear}
      onCreate={vi.fn()}
      onAddToTrip={onAddToTrip}
    />)

    fireEvent.click(screen.getByRole('button', { name: 'Ajouter à la nuit 1' }))

    expect(onAddToTrip).toHaveBeenCalledWith(result)
    expect(onClear).toHaveBeenCalledTimes(1)
  })
})
