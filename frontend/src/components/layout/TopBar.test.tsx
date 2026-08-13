import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ThemeProvider } from '../../theme/ThemeProvider'
import { TopBar } from './TopBar'
import { panelLayoutModeStorageKey } from './FloatingPanelWindow'

const logout = vi.fn()
let currentUser = { id: 'user-id', email: 'admin@example.test', display_name: 'Admin', is_admin: true, avatar_url: null }

vi.mock('../../auth/useAuth', () => ({ useAuth: () => ({ user: currentUser, logout }) }))
vi.mock('../notifications/NotificationCenter', () => ({ NotificationCenter: () => <button type="button" aria-label="Notifications">Notifications</button> }))
vi.mock('../account/AccountModal', () => ({ AccountModal: ({ onClose }: { onClose: () => void }) => <div role="dialog" aria-label="Espace compte"><button onClick={onClose}>Fermer</button></div> }))

function renderTopBar(markerCount = 0, initialEntry = '/workspace', panelLayoutScope = 'map') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <ThemeProvider>
        <TopBar isMapWorkspace markerCount={markerCount} panelLayoutScope={panelLayoutScope} onMapAccessChanged={vi.fn()} onOpenAdmin={vi.fn()} onOpenRegistrationRequests={vi.fn()} />
        <CurrentPath />
      </ThemeProvider>
    </MemoryRouter>,
  )
}

function CurrentPath() {
  const location = useLocation()
  return <output data-testid="current-path">{location.pathname}</output>
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  localStorage.clear()
  document.documentElement.removeAttribute('data-theme')
  document.documentElement.style.removeProperty('color-scheme')
  currentUser = { id: 'user-id', email: 'admin@example.test', display_name: 'Admin', is_admin: true, avatar_url: null }
})

describe('TopBar account entry', () => {
  it('shows the layout lock state of the active screen only', () => {
    localStorage.setItem(panelLayoutModeStorageKey('places'), 'default')
    localStorage.setItem(panelLayoutModeStorageKey('categories'), 'custom')
    const { container, rerender } = renderTopBar(0, '/workspace', 'places')
    const layoutButton = container.querySelector('.desktop-panel-layout-reset')
    expect(layoutButton).toHaveAttribute('aria-pressed', 'true')

    rerender(
      <MemoryRouter initialEntries={['/workspace']}>
        <ThemeProvider>
          <TopBar isMapWorkspace markerCount={0} panelLayoutScope="categories" onMapAccessChanged={vi.fn()} onOpenAdmin={vi.fn()} onOpenRegistrationRequests={vi.fn()} />
          <CurrentPath />
        </ThemeProvider>
      </MemoryRouter>,
    )

    expect(container.querySelector('.desktop-panel-layout-reset')).toHaveAttribute('aria-pressed', 'false')
  })

  it('places notifications before the user menu and opens account options explicitly', () => {
    renderTopBar(2)
    const notifications = screen.getByRole('button', { name: 'Notifications' })
    const account = screen.getByRole('button', { name: /Admin$/ })
    expect(notifications.compareDocumentPosition(account) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    fireEvent.click(account)
    const options = screen.getByRole('menuitem', { name: 'Options' })
    const administration = screen.getByRole('menuitem', { name: 'Administration' })
    const api = screen.getByRole('menuitem', { name: 'API' })
    expect(options).toBeVisible()
    expect(administration).toBeVisible()
    expect(api).toHaveAttribute('href', `${window.location.origin}/api/docs`)
    expect(api).toHaveAttribute('target', '_blank')
    expect(api).toHaveAttribute('rel', 'noopener noreferrer')
    expect(options.compareDocumentPosition(api) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.getByRole('menuitem', { name: /connexion$/i })).toBeVisible()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    fireEvent.click(options)
    expect(screen.getByRole('dialog', { name: 'Espace compte' })).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Fermer' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('logs out directly from the user menu and returns to the login page', async () => {
    renderTopBar()
    fireEvent.click(screen.getByRole('button', { name: /Admin$/ }))
    fireEvent.click(screen.getByRole('menuitem', { name: /connexion$/i }))
    expect(logout).toHaveBeenCalledOnce()
    await waitFor(() => expect(screen.getByTestId('current-path')).toHaveTextContent('/login'))
  })

  it('returns to the login page even when the logout request fails', async () => {
    logout.mockRejectedValueOnce(new Error('Network error'))
    renderTopBar()
    fireEvent.click(screen.getByRole('button', { name: /Admin$/ }))
    fireEvent.click(screen.getByRole('menuitem', { name: /connexion$/i }))

    await waitFor(() => expect(screen.getByTestId('current-path')).toHaveTextContent('/login'))
  })

  it('hides administration from a standard user', () => {
    currentUser = { ...currentUser, is_admin: false }
    renderTopBar()
    fireEvent.click(screen.getByRole('button', { name: /Admin$/ }))
    expect(screen.queryByRole('menuitem', { name: 'Administration' })).not.toBeInTheDocument()
  })

  it('closes administration before opening the user menu', () => {
    renderTopBar(0, '/admin/users')

    fireEvent.click(screen.getByRole('button', { name: /Admin$/ }))

    expect(screen.getByTestId('current-path')).toHaveTextContent('/')
    expect(screen.getByRole('menu', { name: 'Menu utilisateur' })).toBeVisible()
  })

  it('places the persistent theme toggle before the user control and outside its menu', () => {
    localStorage.setItem('cartavault.theme', 'light')
    renderTopBar()
    const account = screen.getByRole('button', { name: /Admin$/ })
    const themeSwitch = screen.getAllByRole('button', { name: /sombre$/i }).find((button) => button.classList.contains('topbar-theme-toggle'))!
    expect(themeSwitch.compareDocumentPosition(account) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(themeSwitch).toHaveAttribute('aria-pressed', 'false')

    fireEvent.click(themeSwitch)

    expect(themeSwitch).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(account)
    expect(screen.queryByRole('menuitemcheckbox')).not.toBeInTheDocument()
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark')
    expect(localStorage.getItem('cartavault.theme')).toBe('light')
    expect(localStorage.getItem('cartavault.theme:user-id')).toBeNull()
  })
})
