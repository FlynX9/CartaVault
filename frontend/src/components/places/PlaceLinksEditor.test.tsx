import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { PlaceLinksEditor } from './PlaceLinksEditor'

describe('PlaceLinksEditor', () => {
  afterEach(cleanup)
  it('adds, edits, removes and reorders named links without submitting the place form', () => {
    const onChange = vi.fn()
    const links = [
      { clientId: 'one', id: 'one', label: 'Site officiel', url: 'https://example.org' },
      { clientId: 'two', id: 'two', label: 'Archive', url: 'https://archive.example.org' },
    ]
    const { rerender } = render(<PlaceLinksEditor links={links} onChange={onChange} />)

    fireEvent.click(screen.getByRole('button', { name: 'Descendre Site officiel' }))
    expect(onChange).toHaveBeenLastCalledWith([links[1], links[0]])

    fireEvent.change(screen.getAllByLabelText('Nom du lien')[0], { target: { value: 'Article' } })
    expect(onChange).toHaveBeenLastCalledWith([{ ...links[0], label: 'Article' }, links[1]])

    fireEvent.click(screen.getByRole('button', { name: 'Supprimer Archive' }))
    expect(onChange).toHaveBeenLastCalledWith([links[0]])

    rerender(<PlaceLinksEditor links={[]} onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter un lien' }))
    expect(onChange).toHaveBeenLastCalledWith([expect.objectContaining({ label: '', url: '' })])
  })

  it('shows inline HTTP validation and exact duplicate detection', () => {
    render(<PlaceLinksEditor links={[
      { clientId: 'one', label: 'Dangereux', url: 'javascript:alert(1)' },
      { clientId: 'two', label: 'Copie', url: 'https://example.org' },
      { clientId: 'three', label: 'Copie 2', url: 'https://example.org' },
    ]} onChange={vi.fn()} />)

    const table = screen.getByRole('table', { name: 'Liens du POI' })
    expect(within(table).getByText('Utilisez une adresse HTTP ou HTTPS valide.')).toBeInTheDocument()
    expect(within(table).getAllByText('Cette URL est déjà présente.')).toHaveLength(2)
  })
})
