import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { useConfirmDialog } from './useConfirmDialog'

function Harness() {
  const { confirm, confirmationDialog } = useConfirmDialog()

  return <>
    <button type="button" onClick={() => void confirm({ title: 'Supprimer cet élément ?', message: 'Cette action est irréversible.' }).then((confirmed) => { document.body.dataset.confirmed = String(confirmed) })}>Ouvrir</button>
    {confirmationDialog}
  </>
}

afterEach(() => { cleanup(); delete document.body.dataset.confirmed })

describe('useConfirmDialog', () => {
  it('renders an accessible CartaVault confirmation and resolves the destructive action', async () => {
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: 'Ouvrir' }))

    const dialog = screen.getByRole('alertdialog', { name: 'Supprimer cet élément ?' })
    expect(dialog).toHaveTextContent('Cette action est irréversible.')
    await waitFor(() => expect(screen.getByRole('button', { name: 'Annuler' })).toHaveFocus())

    fireEvent.click(screen.getByRole('button', { name: 'Supprimer' }))
    await waitFor(() => expect(document.body.dataset.confirmed).toBe('true'))
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it('cancels with Escape', async () => {
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: 'Ouvrir' }))
    fireEvent.keyDown(document, { key: 'Escape' })

    await waitFor(() => expect(document.body.dataset.confirmed).toBe('false'))
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })
})
