import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { OrganizationDialog } from './OrganizationDialog'

describe('OrganizationDialog', () => {
  it('closes from its backdrop and on Escape', () => {
    const onClose = vi.fn()
    render(<OrganizationDialog label="Catégories" onClose={onClose}><p>Contenu</p></OrganizationDialog>)

    expect(screen.getByRole('dialog', { name: 'Catégories' })).toBeVisible()
    fireEvent.mouseDown(screen.getByRole('dialog', { name: 'Catégories' }).parentElement!)
    fireEvent.keyDown(document, { key: 'Escape' })

    expect(onClose).toHaveBeenCalledTimes(2)
  })
})
