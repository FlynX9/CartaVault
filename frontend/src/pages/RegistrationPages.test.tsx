import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { confirmPasswordReset, register, requestPasswordReset } from '../api/registration'
import { ForgotPasswordPage, ResetPasswordPage } from './PasswordResetPages'
import { RegisterPage } from './RegisterPage'

vi.mock('../api/registration', () => ({
  register: vi.fn(),
  requestPasswordReset: vi.fn(),
  confirmPasswordReset: vi.fn(),
}))

describe('public registration and password reset pages', () => {
  beforeEach(() => vi.clearAllMocks())

  it('submits a registration request and explains admin approval', async () => {
    vi.mocked(register).mockResolvedValue({ status: 'pending', message: 'ok' })
    render(<MemoryRouter><RegisterPage /></MemoryRouter>)
    fireEvent.change(screen.getByLabelText('Adresse email'), { target: { value: 'new@example.test' } })
    fireEvent.change(screen.getByLabelText(/^Mot de passe/), { target: { value: 'a sufficiently long password' } })
    fireEvent.change(screen.getByLabelText(/^Confirmer le mot de passe$/), { target: { value: 'a sufficiently long password' } })
    fireEvent.click(screen.getByRole('button', { name: 'Demander mon inscription' }))

    expect(await screen.findByText('Demande transmise')).toBeVisible()
    expect(register).toHaveBeenCalledWith('new@example.test', 'a sufficiently long password', 'a sufficiently long password')
  })

  it('always displays the generic reset request response', async () => {
    vi.mocked(requestPasswordReset).mockResolvedValue({ message: 'Si un compte correspond à cette adresse, un email a été envoyé.' })
    render(<MemoryRouter><ForgotPasswordPage /></MemoryRouter>)
    fireEvent.change(screen.getByLabelText('Adresse email'), { target: { value: 'user@example.test' } })
    fireEvent.click(screen.getByRole('button', { name: 'Envoyer le lien' }))

    expect(await screen.findByText(/Si un compte correspond/)).toBeVisible()
  })

  it('confirms a reset token from the URL', async () => {
    vi.mocked(confirmPasswordReset).mockResolvedValue()
    render(<MemoryRouter initialEntries={['/reset-password?token=opaque-token-value-that-is-long-enough']}><ResetPasswordPage /></MemoryRouter>)
    fireEvent.change(screen.getByLabelText(/^Nouveau mot de passe$/), { target: { value: 'a brand new long password' } })
    fireEvent.change(screen.getByLabelText(/^Confirmer le mot de passe$/), { target: { value: 'a brand new long password' } })
    fireEvent.click(screen.getByRole('button', { name: 'Modifier le mot de passe' }))

    await waitFor(() => expect(confirmPasswordReset).toHaveBeenCalledWith('opaque-token-value-that-is-long-enough', 'a brand new long password', 'a brand new long password'))
    expect(await screen.findByText(/anciennes sessions/)).toBeVisible()
  })
})
