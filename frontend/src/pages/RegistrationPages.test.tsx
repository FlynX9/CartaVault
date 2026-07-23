import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { confirmPasswordReset, register, requestPasswordReset } from '../api/registration'
import { ThemeContext } from '../theme/themeContext'
import { ForgotPasswordPage, ResetPasswordPage } from './PasswordResetPages'
import { RegisterPage } from './RegisterPage'

vi.mock('../api/registration', () => ({
  register: vi.fn(),
  requestPasswordReset: vi.fn(),
  confirmPasswordReset: vi.fn(),
}))

describe('public registration and password reset pages', () => {
  beforeEach(() => vi.clearAllMocks())
  afterEach(() => cleanup())

  const renderPage = (page: ReactNode, initialEntries = ['/']) => render(
    <ThemeContext.Provider value={{
      preference: 'light',
      resolvedTheme: 'light',
      setPreference: vi.fn(),
      toggleTheme: vi.fn(),
    }}>
      <MemoryRouter initialEntries={initialEntries}>{page}</MemoryRouter>
    </ThemeContext.Provider>,
  )

  it('submits a registration request and explains admin approval', async () => {
    vi.mocked(register).mockResolvedValue({ status: 'pending', message: 'ok' })
    renderPage(<RegisterPage />)
    fireEvent.change(screen.getByLabelText('Adresse email'), { target: { value: 'new@example.test' } })
    fireEvent.change(screen.getByLabelText(/^Mot de passe/), { target: { value: 'a sufficiently long password' } })
    fireEvent.change(screen.getByLabelText(/^Confirmer le mot de passe$/), { target: { value: 'a sufficiently long password' } })
    fireEvent.click(screen.getByRole('button', { name: 'Demander mon inscription' }))

    expect(await screen.findByText('Demande transmise')).toBeVisible()
    expect(register).toHaveBeenCalledWith('new@example.test', 'a sufficiently long password', 'a sufficiently long password', 'fr')
  })

  it('always displays the generic reset request response', async () => {
    vi.mocked(requestPasswordReset).mockResolvedValue({ message: 'Si un compte correspond à cette adresse, un email a été envoyé.' })
    renderPage(<ForgotPasswordPage />)
    fireEvent.change(screen.getByLabelText('Adresse email'), { target: { value: 'user@example.test' } })
    fireEvent.click(screen.getByRole('button', { name: 'Envoyer le lien' }))

    expect(await screen.findByText(/Si un compte correspond/)).toBeVisible()
  })

  it('confirms a reset token from the URL', async () => {
    vi.mocked(confirmPasswordReset).mockResolvedValue()
    renderPage(<ResetPasswordPage />, ['/reset-password?token=opaque-token-value-that-is-long-enough'])
    fireEvent.change(screen.getByLabelText(/^Nouveau mot de passe$/), { target: { value: 'a brand new long password' } })
    fireEvent.change(screen.getByLabelText(/^Confirmer le mot de passe$/), { target: { value: 'a brand new long password' } })
    fireEvent.click(screen.getByRole('button', { name: 'Modifier le mot de passe' }))

    await waitFor(() => expect(confirmPasswordReset).toHaveBeenCalledWith('opaque-token-value-that-is-long-enough', 'a brand new long password', 'a brand new long password'))
    expect(await screen.findByText(/anciennes sessions/)).toBeVisible()
  })
})
