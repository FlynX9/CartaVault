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

  it('keeps a single active workspace entry and exposes the maps catalog', () => {
    const onPanelChange = vi.fn()
    render(<MemoryRouter><MainNavigation activePanel={'maps' as WorkspacePanel} onPanelChange={onPanelChange} /></MemoryRouter>)
    expect(screen.getByRole('button', { name: 'Cartes' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Lieux' })).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(screen.getByRole('button', { name: 'Cartes' }))
    expect(onPanelChange).toHaveBeenCalledWith(null)
  })

  it('uses workspace buttons for all workspace panels without changing the URL', () => {
    const onPanelChange = vi.fn()
    render(<MemoryRouter><MainNavigation activePanel={'places' as WorkspacePanel} onPanelChange={onPanelChange} /><Location /></MemoryRouter>)

    fireEvent.click(screen.getByRole('button', { name: 'Catégories' }))
    fireEvent.click(screen.getByRole('button', { name: 'Tags' }))
    fireEvent.click(screen.getByRole('button', { name: 'Statuts' }))

    expect(onPanelChange).toHaveBeenNthCalledWith(1, 'categories')
    expect(onPanelChange).toHaveBeenNthCalledWith(2, 'tags')
    expect(onPanelChange).toHaveBeenNthCalledWith(3, 'statuses')
    expect(screen.getByTestId('location')).toHaveTextContent('/')
  })

  it('does not render Administration in the primary navigation', () => {
    render(<MemoryRouter><MainNavigation activePanel={'places' as WorkspacePanel} onPanelChange={vi.fn()} /><Location /></MemoryRouter>)
    expect(screen.queryByRole('button', { name: 'Carte' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Administration' })).not.toBeInTheDocument()
    expect(screen.getByText('Catégories')).toBeVisible()
    expect(screen.getByText('Export')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Lieux' })).toHaveAttribute('aria-pressed', 'true')
  })
})
