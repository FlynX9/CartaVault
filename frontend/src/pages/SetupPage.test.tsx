import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { verifySetupToken } from '../api/setup'
import { SetupPage } from './SetupPage'

vi.mock('../api/setup', async (importOriginal) => {
  const original = await importOriginal<typeof import('../api/setup')>()
  return {
    ...original,
    verifySetupToken: vi.fn(),
    completeInitialSetup: vi.fn(),
  }
})

vi.mock('../components/auth/AuthLayout', () => ({
  AuthLayout: ({ children }: { children: ReactNode }) => <>{children}</>,
}))

describe('initial setup wizard', () => {
  beforeEach(() => vi.clearAllMocks())
  afterEach(() => cleanup())

  it('requires the one-time token before opening administrator configuration', async () => {
    vi.mocked(verifySetupToken).mockResolvedValue({ valid: true })
    render(<SetupPage
      status={{
        required: true,
        locked: false,
        checks: [{ key: 'database', label: 'Database', status: 'ready', detail: 'PostgreSQL is reachable.' }],
      }}
      onCompleted={vi.fn()}
    />)

    const continueButton = screen.getByRole('button', { name: /Continuer/ })
    expect(continueButton).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Jeton de configuration'), { target: { value: 'one-time-token' } })
    fireEvent.click(screen.getByRole('button', { name: 'Vérifier' }))

    await waitFor(() => expect(verifySetupToken).toHaveBeenCalledWith('one-time-token'))
    expect(continueButton).toBeEnabled()
    fireEvent.click(continueButton)
    expect(screen.getByRole('heading', { name: 'Premier administrateur' })).toBeVisible()
  })

  it('blocks progression while a technical prerequisite is failing', () => {
    render(<SetupPage
      status={{
        required: true,
        locked: false,
        checks: [{ key: 'schema', label: 'Schema', status: 'error', detail: 'Database migrations are incomplete.' }],
      }}
      onCompleted={vi.fn()}
    />)

    expect(screen.getByText('Database migrations are incomplete.')).toBeVisible()
    expect(screen.getByRole('button', { name: /Continuer/ })).toBeDisabled()
  })
})
