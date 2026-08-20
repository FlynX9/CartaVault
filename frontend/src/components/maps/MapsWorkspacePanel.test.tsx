import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { acceptPendingMapInvitation, declinePendingMapInvitation, getPendingMapInvitations } from '../../api/maps'
import type { PoiMap } from '../../types/map'
import { MapsWorkspacePanel } from './MapsWorkspacePanel'

vi.mock('../../api/maps', () => ({ acceptPendingMapInvitation: vi.fn(), declinePendingMapInvitation: vi.fn(), getPendingMapInvitations: vi.fn() }))

const map = { id: 'map-id', name: 'France historique', country: { name: 'France', iso_alpha2: 'FR' }, is_shared: false, place_count: 12, trip_count: 3 } as PoiMap

describe('MapsWorkspacePanel', () => {
  beforeEach(() => {
    vi.mocked(getPendingMapInvitations).mockResolvedValue([])
    vi.mocked(acceptPendingMapInvitation).mockResolvedValue()
    vi.mocked(declinePendingMapInvitation).mockResolvedValue()
  })
  afterEach(() => { cleanup(); vi.clearAllMocks() })

  it('renders a searchable visual map card with accessible actions', () => {
    const open = vi.fn(); const remove = vi.fn()
    render(<MapsWorkspacePanel maps={[map]} activeMapId="map-id" isLoading={false} errorMessage={null} onOpen={open} onDelete={remove} onCreated={vi.fn()} onClose={vi.fn()} />)
    expect(screen.getByText('France historique')).toBeVisible()
    expect(screen.getByText('12 POI')).toBeVisible()
    expect(screen.getByText('3 sorties')).toBeVisible()
    const preview = screen.getByRole('img', { name: 'Aperçu cartographique de France historique, France' })
    expect(preview).toBeVisible()
    expect(preview.closest('.maps-catalog__summary')).toBeVisible()
    expect(preview.querySelector('img')).toHaveAttribute('src', expect.stringMatching(/^https:\/\/tile\.openstreetmap\.org\//))
    expect(screen.getByLabelText('Carte privée')).toBeVisible()
    const createButton = screen.getByRole('button', { name: 'Créer une carte' })
    expect(createButton).toHaveClass('panel-create-action')
    expect(createButton).toHaveTextContent('Nouvelle carte')
    const openButton = screen.getByRole('button', { name: 'Ouvrir France historique' })
    expect(openButton).toHaveTextContent('Ouvrir')
    fireEvent.click(openButton)
    expect(open).toHaveBeenCalledWith('map-id')
    fireEvent.click(screen.getByRole('button', { name: 'Options de France historique' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Supprimer France historique' }))
    expect(remove).toHaveBeenCalledWith(map)
  })

  it('filters by map and country names', () => {
    render(<MapsWorkspacePanel maps={[map]} activeMapId={null} isLoading={false} errorMessage={null} onOpen={vi.fn()} onDelete={vi.fn()} onCreated={vi.fn()} onClose={vi.fn()} />)
    fireEvent.change(screen.getByRole('searchbox', { name: 'Rechercher une carte' }), { target: { value: 'france' } })
    expect(screen.getByText('France historique')).toBeVisible()
    fireEvent.change(screen.getByRole('searchbox', { name: 'Rechercher une carte' }), { target: { value: 'espagne' } })
    expect(screen.getByText('Aucune carte ne correspond à la recherche.')).toBeVisible()
  })

  it('collapses the map catalog instead of closing it', () => {
    const onCollapsedChange = vi.fn()
    render(<MapsWorkspacePanel maps={[map]} activeMapId={null} isLoading={false} errorMessage={null} onOpen={vi.fn()} onDelete={vi.fn()} onCreated={vi.fn()} collapsed onCollapsedChange={onCollapsedChange} />)

    expect(document.getElementById('workspace-maps-panel')).toHaveClass('is-collapsed')
    const maximize = screen.getByRole('button', { name: 'Agrandir le panneau' })
    expect(maximize.querySelector('.lucide-plus')).toBeInTheDocument()
    fireEvent.click(maximize)

    expect(onCollapsedChange).toHaveBeenCalledWith(false)
  })

  it('adapts sensitive actions to server-provided permissions', () => {
    const viewerMap: PoiMap = { ...map, is_shared: true, current_user_role: 'viewer', owner_email: 'owner@example.test', owner_display_name: 'Alice Martin', can_export: true, can_delete: false, can_manage_members: false }
    const { rerender } = render(<MapsWorkspacePanel maps={[viewerMap]} activeMapId={null} isLoading={false} errorMessage={null} onOpen={vi.fn()} onDelete={vi.fn()} onCreated={vi.fn()} onExport={vi.fn()} onMembers={vi.fn()} onClose={vi.fn()} />)
    expect(screen.getByText(/Lecteur/)).toBeVisible()
    expect(screen.getByText('Alice Martin')).toBeVisible()
    expect(screen.getByLabelText('Carte partagée')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Exporter France historique' })).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Options de France historique' }))
    expect(screen.queryByRole('menuitem', { name: 'Supprimer France historique' })).not.toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'Membres' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Options de France historique' }))
    const ownerMap: PoiMap = { ...viewerMap, current_user_role: 'owner', can_delete: true, can_manage_members: true }
    rerender(<MapsWorkspacePanel maps={[ownerMap]} activeMapId={null} isLoading={false} errorMessage={null} onOpen={vi.fn()} onDelete={vi.fn()} onCreated={vi.fn()} onExport={vi.fn()} onMembers={vi.fn()} onClose={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Options de France historique' }))
    expect(screen.getByRole('menuitem', { name: 'Supprimer France historique' })).toBeVisible()
    expect(screen.getByRole('menuitem', { name: 'Membres' })).toBeVisible()
  })

  it('renders pending invitations as disabled cards with accept and decline actions', async () => {
    vi.mocked(getPendingMapInvitations).mockResolvedValue([{ id: 'invitation-id', map_id: 'shared-map-id', map_name: 'Belgique partagée', role: 'viewer', invited_by_display_name: 'Alice', created_at: '2026-07-16T08:00:00', expires_at: '2026-07-23T08:00:00' }])
    const onAccessChanged = vi.fn()
    render(<MapsWorkspacePanel maps={[map]} activeMapId={null} isLoading={false} errorMessage={null} onOpen={vi.fn()} onDelete={vi.fn()} onCreated={vi.fn()} onAccessChanged={onAccessChanged} onClose={vi.fn()} />)
    const card = (await screen.findByText('Belgique partagée')).closest('li')
    expect(card).toHaveClass('maps-catalog__invitation')
    expect(card).toHaveTextContent('Invitation en attente')
    expect(screen.queryByRole('button', { name: 'Ouvrir Belgique partagée' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Accepter' }))
    await waitFor(() => expect(acceptPendingMapInvitation).toHaveBeenCalledWith('invitation-id'))
    expect(onAccessChanged).toHaveBeenCalledOnce()
  })
})
