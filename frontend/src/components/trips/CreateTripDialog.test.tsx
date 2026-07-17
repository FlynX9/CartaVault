import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { CreateTripDialog } from './CreateTripDialog'

describe('CreateTripDialog', () => {
  afterEach(() => document.body.replaceChildren())

  it('creates a trip from an integrated accessible modal', async () => {
    const onCreate = vi.fn().mockResolvedValue(undefined)
    render(<CreateTripDialog mapName="Belgique" onClose={vi.fn()} onCreate={onCreate} />)
    expect(screen.getByRole('dialog', { name: 'Préparer une sortie' })).toBeVisible()
    expect(screen.getByText('Carte : Belgique')).toBeVisible()
    fireEvent.change(screen.getByLabelText('Nom de la sortie *'), { target: { value: 'Ardennes' } })
    fireEvent.change(screen.getByLabelText('Date de début'), { target: { value: '2026-08-10' } })
    fireEvent.change(screen.getByLabelText('Date de fin'), { target: { value: '2026-08-12' } })
    fireEvent.change(screen.getByLabelText('Mode de déplacement'), { target: { value: 'walking' } })
    fireEvent.click(screen.getByRole('button', { name: 'Créer la sortie' }))
    await waitFor(() => expect(onCreate).toHaveBeenCalledWith({ name: 'Ardennes', description: undefined, start_date: '2026-08-10', end_date: '2026-08-12', routing_profile: 'walking' }))
  })

  it('keeps the modal open and shows a compact error if creation fails', async () => {
    render(<CreateTripDialog mapName="Belgique" onClose={vi.fn()} onCreate={vi.fn().mockRejectedValue(new Error('Internal Server Error'))} />)
    fireEvent.change(screen.getByLabelText('Nom de la sortie *'), { target: { value: 'Test' } })
    fireEvent.click(screen.getByRole('button', { name: 'Créer la sortie' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Impossible de créer la sortie pour le moment.')
    expect(screen.getByRole('dialog')).toBeVisible()
  })
})
