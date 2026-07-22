import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TopBar } from './TopBar'

const logout = vi.fn()
let currentUser = { id: 'user-id', email: 'admin@example.test', display_name: 'Admin', is_admin: true, avatar_url: null }
vi.mock('../../auth/useAuth', () => ({ useAuth: () => ({ user: currentUser, logout }) }))
vi.mock('../notifications/NotificationCenter', () => ({ NotificationCenter: () => <button type="button" aria-label="Notifications">Notifications</button> }))
vi.mock('../account/AccountModal', () => ({ AccountModal: ({ onClose }: { onClose: () => void }) => <div role="dialog" aria-label="Espace compte"><button onClick={onClose}>Fermer</button></div> }))
afterEach(() => { cleanup(); vi.clearAllMocks(); currentUser = { id: 'user-id', email: 'admin@example.test', display_name: 'Admin', is_admin: true, avatar_url: null } })

describe('TopBar account entry', () => {
  it('places notifications before the user menu and opens account options explicitly', () => {
    render(<TopBar isMapWorkspace markerCount={2} onMapAccessChanged={vi.fn()} onOpenAdmin={vi.fn()} />)
    const notifications = screen.getByRole('button', { name: 'Notifications' })
    const account = screen.getByRole('button', { name: 'Menu utilisateur de Admin' })
    expect(notifications.compareDocumentPosition(account) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    fireEvent.click(account)
    const options = screen.getByRole('menuitem', { name: 'Options' })
    const administration = screen.getByRole('menuitem', { name: 'Administration' })
    const api = screen.getByRole('menuitem', { name: 'API' })
    expect(options).toBeVisible()
    expect(administration).toBeVisible()
    expect(api).toHaveAttribute('href', 'http://localhost:8000/docs')
    expect(api).toHaveAttribute('target', '_blank')
    expect(api).toHaveAttribute('rel', 'noopener noreferrer')
    expect(options.compareDocumentPosition(api) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.getByRole('menuitem', { name: 'Déconnexion' })).toBeVisible()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Options' }))
    expect(screen.getByRole('dialog', { name: 'Espace compte' })).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Fermer' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('logs out directly from the user menu', () => {
    render(<TopBar isMapWorkspace markerCount={0} onMapAccessChanged={vi.fn()} onOpenAdmin={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Menu utilisateur de Admin' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Déconnexion' }))
    expect(logout).toHaveBeenCalledOnce()
  })

  it('hides administration from a standard user', () => {
    currentUser = { ...currentUser, is_admin: false }
    render(<TopBar isMapWorkspace markerCount={0} onMapAccessChanged={vi.fn()} onOpenAdmin={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Menu utilisateur de Admin' }))
    expect(screen.queryByRole('menuitem', { name: 'Administration' })).not.toBeInTheDocument()
  })
})
