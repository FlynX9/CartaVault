import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, useLocation } from 'react-router-dom'

import { MainNavigation, type WorkspacePanel } from './MainNavigation'

function Location() {
  const location = useLocation()
  return <output data-testid="location">{location.pathname}</output>
}

describe('MainNavigation', () => {
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('opens the dashboard and keeps it as the only active navigation entry', () => {
    const onOpenDashboard = vi.fn()
    render(<MemoryRouter><MainNavigation activePanel={null} dashboardActive onPanelChange={vi.fn()} onOpenDashboard={onOpenDashboard} /></MemoryRouter>)

    const dashboard = screen.getByRole('button', { name: 'Accueil' })
    expect(dashboard).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Cartes' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: 'Lieux' })).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(dashboard)
    expect(onOpenDashboard).toHaveBeenCalledOnce()
  })

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
    fireEvent.click(screen.getByRole('button', { name: 'Médias' }))
    fireEvent.click(screen.getByRole('button', { name: 'Tags' }))
    fireEvent.click(screen.getByRole('button', { name: 'Statuts' }))
    fireEvent.click(screen.getByRole('button', { name: 'Corbeille' }))
    fireEvent.click(screen.getByRole('button', { name: 'Sorties' }))

    expect(onPanelChange).toHaveBeenNthCalledWith(1, 'categories')
    expect(onPanelChange).toHaveBeenNthCalledWith(2, 'media')
    expect(onPanelChange).toHaveBeenNthCalledWith(3, 'tags')
    expect(onPanelChange).toHaveBeenNthCalledWith(4, 'statuses')
    expect(onPanelChange).toHaveBeenNthCalledWith(5, 'trash')
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

  it('hides map-dependent entries when the user has no accessible maps', () => {
    render(<MemoryRouter><MainNavigation activePanel={null} onPanelChange={vi.fn()} isAdmin hasMaps={false} /></MemoryRouter>)

    expect(screen.getByRole('button', { name: 'Cartes' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Corbeille' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Lieux' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Sorties' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Tags' })).not.toBeInTheDocument()
  })

  it('delegates a repeated Places click to the panel collapse toggle', () => {
    const onPanelChange = vi.fn()
    const onPlacesPanelToggle = vi.fn()
    render(<MemoryRouter><MainNavigation activePanel="places" onPanelChange={onPanelChange} onPlacesPanelToggle={onPlacesPanelToggle} /></MemoryRouter>)

    fireEvent.click(screen.getByRole('button', { name: 'Lieux' }))

    expect(onPlacesPanelToggle).toHaveBeenCalledOnce()
    expect(onPanelChange).not.toHaveBeenCalled()
  })

  it('delegates repeated workspace entries to the shared collapse toggle', () => {
    const onPanelChange = vi.fn()
    const onWorkspacePanelToggle = vi.fn()
    render(<MemoryRouter><MainNavigation activePanel="categories" onPanelChange={onPanelChange} onWorkspacePanelToggle={onWorkspacePanelToggle} /></MemoryRouter>)

    fireEvent.click(screen.getByRole('button', { name: 'Catégories' }))

    expect(onWorkspacePanelToggle).toHaveBeenCalledWith('categories')
    expect(onPanelChange).not.toHaveBeenCalled()
  })

  it.each([
    ['categories', 0],
    ['tags', 1],
    ['statuses', 2],
    ['annotation-templates', 3],
  ] as const)('keeps the active %s panel open after a repeated mobile selection', (panel, menuIndex) => {
    const onPanelChange = vi.fn()
    const onWorkspacePanelToggle = vi.fn()
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: true }))
    render(<MemoryRouter><MainNavigation activePanel={panel} onPanelChange={onPanelChange} onWorkspacePanelToggle={onWorkspacePanelToggle} isAdmin /></MemoryRouter>)

    fireEvent.click(screen.getByRole('button', { name: 'Organisation' }))
    fireEvent.click(screen.getAllByRole('menuitem')[menuIndex])

    expect(onWorkspacePanelToggle).not.toHaveBeenCalled()
    expect(onPanelChange).not.toHaveBeenCalled()
    expect(screen.queryByRole('menu', { name: 'Organisation' })).not.toBeInTheDocument()
  })

  it('exposes annotations and trash from the mobile Organisation menu', () => {
    const onPanelChange = vi.fn()
    render(<MemoryRouter><MainNavigation activePanel={null} onPanelChange={onPanelChange} /></MemoryRouter>)

    fireEvent.click(screen.getByRole('button', { name: 'Organisation' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Annotations' }))

    expect(onPanelChange).toHaveBeenCalledWith('annotation-templates')
    expect(screen.queryByRole('menu', { name: 'Organisation' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Organisation' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Corbeille' }))

    expect(onPanelChange).toHaveBeenCalledWith('trash')
  })

  it('closes the mobile Organisation menu when pressing elsewhere', () => {
    render(<MemoryRouter><MainNavigation activePanel={null} onPanelChange={vi.fn()} /></MemoryRouter>)

    fireEvent.click(screen.getByRole('button', { name: 'Organisation' }))
    expect(screen.getByRole('menu', { name: 'Organisation' })).toBeInTheDocument()
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Accueil' }))

    expect(screen.queryByRole('menu', { name: 'Organisation' })).not.toBeInTheDocument()
  })

  it('marks only Sorties active while trip planning extends the Places workspace', () => {
    render(<MemoryRouter><MainNavigation activePanel="places" tripPlanningActive onPanelChange={vi.fn()} /></MemoryRouter>)
    const places = screen.getByRole('button', { name: 'Lieux' })
    const trips = screen.getByRole('button', { name: 'Sorties' })
    const media = screen.getByRole('button', { name: 'Médias' })
    const categories = screen.getByRole('button', { name: 'Catégories' })
    expect(trips).toHaveAttribute('aria-pressed', 'true')
    expect(places).toHaveAttribute('aria-pressed', 'false')
    expect(places.compareDocumentPosition(trips) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(trips.compareDocumentPosition(media) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(media.compareDocumentPosition(categories) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(trips.compareDocumentPosition(categories) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})
