import { useState } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { PlaceLinkFormValue } from '../../types/place'
import { PlaceLinksEditor } from './PlaceLinksEditor'

// The editor is a controlled component: apply emitted changes so the row
// reflects the parent state, like the real place form does.
function EditableLinks({ initial, onChange }: { initial: PlaceLinkFormValue[]; onChange?: (links: PlaceLinkFormValue[]) => void }) {
  const [links, setLinks] = useState(initial)
  return <PlaceLinksEditor links={links} onChange={(next) => { onChange?.(next); setLinks(next) }} />
}

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
    const links: PlaceLinkFormValue[] = [{ clientId: 'one', id: 'one', label: 'Site officiel', url: 'https://example.org' }]
    render(<EditableLinks initial={links} onChange={onChange} />)
    expect(screen.getAllByRole('link', { name: /Site officiel/ })[0]).toHaveAttribute('rel', 'noopener noreferrer')
    fireEvent.click(screen.getByRole('button', { name: 'Modifier Site officiel' }))
    // The link label is now chosen from the "Type de lien" suggestions select,
    // and removal is available again once the edit is confirmed.
    fireEvent.change(screen.getByLabelText('Type de lien'), { target: { value: 'Article' } })
    expect(onChange).toHaveBeenLastCalledWith([{ ...links[0], label: 'Article' }])
    fireEvent.click(screen.getByRole('button', { name: 'Terminer' }))
    fireEvent.click(screen.getByRole('button', { name: 'Supprimer Article' }))
    expect(onChange).toHaveBeenLastCalledWith([])
  })

  it('shows HTTP validation while editing', () => {
    render(<PlaceLinksEditor links={[{ clientId: 'one', label: 'Dangereux', url: 'javascript:alert(1)' }]} onChange={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Modifier Dangereux' }))
    expect(screen.getByText('Utilisez une adresse HTTP ou HTTPS valide.')).toBeInTheDocument()
  })
})
