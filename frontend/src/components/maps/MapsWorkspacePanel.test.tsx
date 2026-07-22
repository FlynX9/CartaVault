import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { acceptPendingMapInvitation, declinePendingMapInvitation, getPendingMapInvitations } from '../../api/maps'
import type { PoiMap } from '../../types/map'
import { MapsWorkspacePanel } from './MapsWorkspacePanel'

vi.mock('../../api/maps', () => ({ acceptPendingMapInvitation: vi.fn(), declinePendingMapInvitation: vi.fn(), getPendingMapInvitations: vi.fn() }))

const map = { id: 'map-id', name: 'France historique', country: { name: 'France', iso_alpha2: 'FR' }, is_shared: false } as PoiMap

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
    const preview = screen.getByRole('img', { name: 'Drapeau France, aperçu de France historique' })
    expect(preview).toBeVisible()
    expect(preview.closest('.maps-catalog__summary')).toBeVisible()
    expect(preview.querySelector('img')).toHaveAttribute('src', 'https://flagcdn.com/fr.svg')
    expect(screen.getByText('Ouverte')).toBeVisible()
    expect(screen.getByLabelText('Carte privée')).toBeVisible()
    const openButton = screen.getByRole('button', { name: 'Ouvrir France historique' })
    expect(openButton).toBeDisabled()
    fireEvent.click(openButton)
    expect(open).not.toHaveBeenCalled()
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

  it('adapts sensitive actions to server-provided permissions', () => {
    const viewerMap: PoiMap = { ...map, is_shared: true, current_user_role: 'viewer', can_export: true, can_delete: false, can_manage_members: false }
    const { rerender } = render(<MapsWorkspacePanel maps={[viewerMap]} activeMapId={null} isLoading={false} errorMessage={null} onOpen={vi.fn()} onDelete={vi.fn()} onCreated={vi.fn()} onExport={vi.fn()} onMembers={vi.fn()} onClose={vi.fn()} />)
    expect(screen.getByText('Lecteur')).toBeVisible()
    expect(screen.getByLabelText('Carte partagée')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Exporter la carte France historique' })).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Supprimer France historique' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Gérer les membres de France historique' })).not.toBeInTheDocument()
    const ownerMap: PoiMap = { ...viewerMap, current_user_role: 'owner', can_delete: true, can_manage_members: true }
    rerender(<MapsWorkspacePanel maps={[ownerMap]} activeMapId={null} isLoading={false} errorMessage={null} onOpen={vi.fn()} onDelete={vi.fn()} onCreated={vi.fn()} onExport={vi.fn()} onMembers={vi.fn()} onClose={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Supprimer France historique' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Gérer les membres de France historique' })).toBeVisible()
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
