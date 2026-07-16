import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ApiError, SESSION_EXPIRED_EVENT } from '../api/client'
import { login, logout, restoreSession } from '../api/auth'
import { AuthProvider } from './AuthProvider'
import { RequireAuth } from './RequireAuth'

vi.mock('../api/auth', () => ({ login: vi.fn(), logout: vi.fn(), restoreSession: vi.fn() }))

const user = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', email: 'owner@example.test', display_name: 'Owner', is_admin: false, is_active: true, created_at: '2026-01-01T00:00:00', updated_at: '2026-01-01T00:00:00', last_login_at: null, csrf_token: 'csrf', avatar_url: null }

afterEach(() => { cleanup(); vi.clearAllMocks() })

describe('AuthProvider', () => {
  it('restores a session before rendering protected content', async () => {
    vi.mocked(restoreSession).mockResolvedValue(user)
    render(<AuthProvider><RequireAuth><p>Carte privée</p></RequireAuth></AuthProvider>)
    expect(screen.getByText('Chargement de CartaVault…')).toBeVisible()
    expect(await screen.findByText('Carte privée')).toBeVisible()
  })

  it('shows login, reports an error, then authenticates', async () => {
    vi.mocked(restoreSession).mockRejectedValue(new ApiError(401, 'Unauthenticated'))
    vi.mocked(login).mockRejectedValueOnce(new Error('Identifiants incorrects')).mockResolvedValueOnce(user)
    render(<AuthProvider><RequireAuth><p>Carte privée</p></RequireAuth></AuthProvider>)
    const email = await screen.findByLabelText('Adresse email')
    fireEvent.change(email, { target: { value: user.email } })
    fireEvent.change(screen.getByLabelText('Mot de passe'), { target: { value: 'wrong' } })
    fireEvent.click(screen.getByRole('button', { name: 'Connexion' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Identifiants incorrects')
    fireEvent.change(screen.getByLabelText('Mot de passe'), { target: { value: 'correct password' } })
    fireEvent.click(screen.getByRole('button', { name: 'Connexion' }))
    expect(await screen.findByText('Carte privée')).toBeVisible()
  })

  it('returns to login when the API reports an expired session', async () => {
    vi.mocked(restoreSession).mockResolvedValue(user)
    render(<AuthProvider><RequireAuth><p>Carte privée</p></RequireAuth></AuthProvider>)
    await screen.findByText('Carte privée')
    window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT))
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Connexion à CartaVault' })).toBeVisible())
    expect(logout).not.toHaveBeenCalled()
  })
})
