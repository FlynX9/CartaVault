import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { MapsWorkspacePanel } from './MapsWorkspacePanel'

const map = { id: 'map-id', name: 'France historique', country: { name: 'France', iso_alpha2: 'FR' } } as never

describe('MapsWorkspacePanel', () => {
  afterEach(cleanup)
  it('renders a searchable visual map card with accessible actions', () => {
    const open = vi.fn(); const remove = vi.fn()
    render(<MapsWorkspacePanel maps={[map]} activeMapId="map-id" isLoading={false} errorMessage={null} onOpen={open} onDelete={remove} onCreated={vi.fn()} onClose={vi.fn()} />)
    expect(screen.getByText('France historique')).toBeVisible()
    expect(screen.getByRole('img', { name: 'Aperçu de France historique' })).toBeVisible()
    expect(screen.getByText('Ouverte')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Ouvrir France historique' }))
    expect(open).toHaveBeenCalledWith('map-id')
    fireEvent.click(screen.getByRole('button', { name: 'Supprimer France historique' }))
    expect(remove).toHaveBeenCalledWith(map)
  })

  it('filters by map and country names', () => {
    render(<MapsWorkspacePanel maps={[map]} activeMapId={null} isLoading={false} errorMessage={null} onOpen={vi.fn()} onDelete={vi.fn()} onCreated={vi.fn()} onClose={vi.fn()} />)
    fireEvent.change(screen.getByRole('searchbox', { name: 'Rechercher une carte' }), { target: { value: 'france' } })
    expect(screen.getByText('France historique')).toBeVisible()
    fireEvent.change(screen.getByRole('searchbox', { name: 'Rechercher une carte' }), { target: { value: 'espagne' } })
    expect(screen.getByText('Aucune carte ne correspond à la recherche.')).toBeVisible()
  })
})
