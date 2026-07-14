import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, useLocation } from 'react-router-dom'

import { MainNavigation, type WorkspacePanel } from './MainNavigation'

function Location() {
  const location = useLocation()
  return <output data-testid="location">{location.pathname}</output>
}

describe('MainNavigation', () => {
  afterEach(cleanup)

  it('uses workspace buttons for all workspace panels without changing the URL', () => {
    const onPanelChange = vi.fn()
    render(<MemoryRouter><MainNavigation activePanel={'places' as WorkspacePanel} onMap={vi.fn()} onPanelChange={onPanelChange} /><Location /></MemoryRouter>)

    fireEvent.click(screen.getByRole('button', { name: 'Catégories' }))
    fireEvent.click(screen.getByRole('button', { name: 'Tags' }))
    fireEvent.click(screen.getByRole('button', { name: 'Statuts' }))

    expect(onPanelChange).toHaveBeenNthCalledWith(1, 'categories')
    expect(onPanelChange).toHaveBeenNthCalledWith(2, 'tags')
    expect(onPanelChange).toHaveBeenNthCalledWith(3, 'statuses')
    expect(screen.getByTestId('location')).toHaveTextContent('/')
  })

  it('does not render Administration in the primary navigation', () => {
    render(<MemoryRouter><MainNavigation activePanel={'places' as WorkspacePanel} onMap={vi.fn()} onPanelChange={vi.fn()} /><Location /></MemoryRouter>)
    expect(screen.queryByRole('link', { name: 'Administration' })).not.toBeInTheDocument()
    expect(screen.getByText('Catégories')).toBeVisible()
    expect(screen.getByText('Export')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Lieux' })).toHaveAttribute('aria-pressed', 'true')
  })
})
