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

  it('uses workspace buttons for content and statuses without duplicating administration', () => {
    const onPanelChange = vi.fn()
    const onOpenTrips = vi.fn()
    render(<MemoryRouter><MainNavigation activePanel={'places' as WorkspacePanel} onPanelChange={onPanelChange} onOpenTrips={onOpenTrips} isAdmin /><Location /></MemoryRouter>)

    fireEvent.click(screen.getByRole('button', { name: 'Catégories' }))
    fireEvent.click(screen.getByRole('button', { name: 'Tags' }))
    fireEvent.click(screen.getByRole('button', { name: 'Statuts' }))
    fireEvent.click(screen.getByRole('button', { name: 'Préparation de sortie' }))

    expect(onPanelChange).toHaveBeenNthCalledWith(1, 'categories')
    expect(onPanelChange).toHaveBeenNthCalledWith(2, 'tags')
    expect(onPanelChange).toHaveBeenNthCalledWith(3, 'statuses')
    expect(onOpenTrips).toHaveBeenCalledOnce()
    expect(screen.queryByRole('button', { name: 'Administration' })).not.toBeInTheDocument()
    expect(screen.getByTestId('location')).toHaveTextContent('/')
  })

  it('hides Administration for a non-administrator', () => {
    render(<MemoryRouter><MainNavigation activePanel={'places' as WorkspacePanel} onPanelChange={vi.fn()} /></MemoryRouter>)
    expect(screen.queryByRole('button', { name: 'Administration' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Statuts' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Lieux' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('marks only Sorties active while trip planning extends the Places workspace', () => {
    render(<MemoryRouter><MainNavigation activePanel="places" tripPlanningActive onPanelChange={vi.fn()} /></MemoryRouter>)
    const places = screen.getByRole('button', { name: 'Lieux' })
    const trips = screen.getByRole('button', { name: 'Préparation de sortie' })
    const categories = screen.getByRole('button', { name: 'Catégories' })
    expect(trips).toHaveAttribute('aria-pressed', 'true')
    expect(places).toHaveAttribute('aria-pressed', 'false')
    expect(places.compareDocumentPosition(trips) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(trips.compareDocumentPosition(categories) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})
