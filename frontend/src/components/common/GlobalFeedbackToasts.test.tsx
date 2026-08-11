import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { GlobalFeedbackToasts } from './GlobalFeedbackToasts'
import { publishGlobalFeedback } from './globalFeedback'

beforeEach(() => vi.useFakeTimers())
afterEach(() => { cleanup(); vi.useRealTimers() })

describe('GlobalFeedbackToasts', () => {
  it('moves an error into a dismissible toast and hides it after three seconds', async () => {
    render(<><GlobalFeedbackToasts /><p className="form-alert" role="alert">Enregistrement impossible.</p></>)

    await act(async () => { await Promise.resolve() })
    expect(screen.getByRole('alert')).toHaveTextContent('Enregistrement impossible.')
    act(() => vi.advanceTimersByTime(3_000))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('can be closed immediately', async () => {
    render(<><GlobalFeedbackToasts /><p className="admin-success" role="status">Modifications enregistrées.</p></>)

    await act(async () => { await Promise.resolve() })
    expect(screen.getByRole('status')).toHaveTextContent('Modifications enregistrées.')
    fireEvent.click(screen.getByRole('button', { name: 'Fermer le message' }))
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('stores displayed feedback in the notification history', async () => {
    window.localStorage.clear()
    render(<><GlobalFeedbackToasts /><p className="admin-success" role="status">Lieu enregistré.</p></>)

    await act(async () => { await Promise.resolve() })
    expect(JSON.parse(window.localStorage.getItem('cartavault:notification-history') ?? '[]')).toEqual([
      expect.objectContaining({ kind: 'success', message: 'Lieu enregistré.' }),
    ])
  })

  it('displays explicit action feedback and stores the same message in history', () => {
    window.localStorage.clear()
    render(<GlobalFeedbackToasts />)

    act(() => publishGlobalFeedback('success', 'POI « Manoir » créé.'))

    expect(screen.getByRole('status')).toHaveTextContent('POI « Manoir » créé.')
    expect(JSON.parse(window.localStorage.getItem('cartavault:notification-history') ?? '[]')).toEqual([
      expect.objectContaining({ kind: 'success', message: 'POI « Manoir » créé.' }),
    ])
  })
})
