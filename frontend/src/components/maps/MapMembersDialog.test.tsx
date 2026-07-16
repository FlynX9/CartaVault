import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createMapInvitation, getMapInvitations, getMapMembers, transferMapOwnership } from '../../api/maps'
import type { PoiMap } from '../../types/map'
import { MapMembersDialog } from './MapMembersDialog'

vi.mock('../../api/maps', () => ({ createMapInvitation: vi.fn(), getMapInvitations: vi.fn(), getMapMembers: vi.fn(), removeMapMember: vi.fn(), revokeMapInvitation: vi.fn(), transferMapOwnership: vi.fn(), updateMapMember: vi.fn() }))

const poiMap = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'Carte privée', country_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', country: { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', iso_alpha2: 'FR', iso_alpha3: 'FRA', name: 'France' }, center_latitude: null, center_longitude: null, default_zoom: null, effective_center_latitude: 46, effective_center_longitude: 2, effective_default_zoom: 5, min_latitude: null, max_latitude: null, min_longitude: null, max_longitude: null, created_at: '2026-01-01', updated_at: '2026-01-01', can_transfer_ownership: true } satisfies PoiMap
const owner = { user: { id: 'owner', email: 'owner@example.test', display_name: 'Owner', is_admin: false, is_active: true, created_at: '', updated_at: '', last_login_at: null }, role: 'owner' as const, created_at: '', updated_at: '' }
const viewer = { user: { ...owner.user, id: 'viewer', email: 'viewer@example.test', display_name: 'Viewer' }, role: 'viewer' as const, created_at: '', updated_at: '' }

beforeEach(() => {
  vi.mocked(getMapMembers).mockResolvedValue([owner, viewer])
  vi.mocked(getMapInvitations).mockResolvedValue([])
  vi.mocked(createMapInvitation).mockResolvedValue({ id: 'invite', map_id: poiMap.id, email: 'new@example.test', role: 'editor', created_at: '', expires_at: '2026-12-31', accepted_at: null, revoked_at: null, invitation_url: '/invitations/raw-token' })
})
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.unstubAllGlobals() })

describe('MapMembersDialog', () => {
  it('uses compact sections, creates a copyable invitation and transfers ownership', async () => {
    const writeText = vi.fn(() => Promise.resolve())
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    vi.stubGlobal('confirm', vi.fn(() => true))
    vi.mocked(transferMapOwnership).mockResolvedValue(poiMap)
    const updated = vi.fn()
    render(<MapMembersDialog poiMap={poiMap} onClose={vi.fn()} onMapUpdated={updated} />)
    expect(await screen.findByText('Propriétaire')).toBeVisible()
    expect(screen.getByRole('heading', { name: 'Inviter un membre' })).toBeVisible()
    expect(screen.getByRole('heading', { name: 'Membres' })).toBeVisible()
    expect(screen.getByRole('heading', { name: 'Invitations en attente' })).toBeVisible()

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'new@example.test' } })
    fireEvent.change(screen.getByLabelText('Rôle'), { target: { value: 'editor' } })
    fireEvent.click(screen.getByRole('button', { name: 'Inviter' }))
    const link = await screen.findByLabelText('Lien d’invitation')
    expect(link).toHaveValue(`${window.location.origin}/invitations/raw-token`)
    fireEvent.click(screen.getByRole('button', { name: 'Copier le lien' }))
    expect(writeText).toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Transférer à Viewer' }))
    expect(transferMapOwnership).toHaveBeenCalledWith(poiMap.id, 'viewer')
  })
})
