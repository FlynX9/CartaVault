import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { PlaceLinksEditor } from './PlaceLinksEditor'

describe('PlaceLinksEditor', () => {
  afterEach(cleanup)

  it('shows an intentional empty state and creates an editable link', () => {
    const onChange = vi.fn()
    render(<PlaceLinksEditor links={[]} onChange={onChange} />)
    expect(screen.getByText('Aucun lien ajouté')).toBeInTheDocument()
    expect(screen.getByText('Ajoutez un site officiel, une source ou une page utile.')).toBeInTheDocument()
    fireEvent.click(screen.getAllByRole('button', { name: 'Ajouter un lien' })[0])
    expect(onChange).toHaveBeenLastCalledWith([expect.objectContaining({ label: '', url: '' })])
  })

  it('edits and removes a compact link row', () => {
    const onChange = vi.fn()
    const links = [{ clientId: 'one', id: 'one', label: 'Site officiel', url: 'https://example.org' }]
    render(<PlaceLinksEditor links={links} onChange={onChange} />)
    expect(screen.getAllByRole('link', { name: /Site officiel/ })[0]).toHaveAttribute('rel', 'noopener noreferrer')
    fireEvent.click(screen.getByRole('button', { name: 'Modifier Site officiel' }))
    fireEvent.change(screen.getByLabelText('Nom du lien'), { target: { value: 'Article' } })
    expect(onChange).toHaveBeenLastCalledWith([{ ...links[0], label: 'Article' }])
    fireEvent.click(screen.getByRole('button', { name: 'Supprimer Site officiel' }))
    expect(onChange).toHaveBeenLastCalledWith([])
  })

  it('shows HTTP validation while editing', () => {
    render(<PlaceLinksEditor links={[{ clientId: 'one', label: 'Dangereux', url: 'javascript:alert(1)' }]} onChange={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Modifier Dangereux' }))
    expect(screen.getByText('Utilisez une adresse HTTP ou HTTPS valide.')).toBeInTheDocument()
  })
})
