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
    expect(screen.getByRole('button', { name: 'Coffre' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: 'Lieux' })).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(dashboard)
    expect(onOpenDashboard).toHaveBeenCalledOnce()
  })

  it('keeps a single active workspace entry and exposes the maps catalog', () => {
    const onPanelChange = vi.fn()
    render(<MemoryRouter><MainNavigation activePanel={'maps' as WorkspacePanel} onPanelChange={onPanelChange} /></MemoryRouter>)
    const vault = screen.getByRole('button', { name: 'Coffre' })
    expect(vault).toHaveAttribute('aria-pressed', 'true')
    expect(vault.querySelector('.cv-main-navigation__vault-icon')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Lieux' })).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(vault)
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

    expect(screen.getByRole('button', { name: 'Coffre' })).toBeInTheDocument()
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

  it('switches the Places icon and title only while its panel is displayed', () => {
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: true }))
    const { rerender } = render(<MemoryRouter><MainNavigation activePanel="places" placesPanelCollapsed onPanelChange={vi.fn()} /></MemoryRouter>)
    const places = screen.getByRole('button', { name: 'Carte' })
    expect(places).toHaveAttribute('data-panel-open', 'false')
    expect(places.querySelector('.cv-main-navigation__places-default-icon')).not.toHaveClass('is-visible')
    expect(places.querySelector('.cv-main-navigation__places-world-map-icon')).toHaveClass('is-visible')
    expect(places.querySelectorAll('.cv-main-navigation__mode-dots i')[0]).not.toHaveClass('is-active')
    expect(places.querySelectorAll('.cv-main-navigation__mode-dots i')[1]).toHaveClass('is-active')

    rerender(<MemoryRouter><MainNavigation activePanel="places" placesPanelCollapsed={false} onPanelChange={vi.fn()} /></MemoryRouter>)
    const map = screen.getByRole('button', { name: 'Lieux' })
    expect(map).toHaveAttribute('data-panel-open', 'true')
    expect(map.querySelector('.cv-main-navigation__places-world-map-icon')).not.toHaveClass('is-visible')
    expect(map.querySelector('.cv-main-navigation__places-default-icon')).toHaveClass('is-visible')
    expect(map.querySelectorAll('.cv-main-navigation__mode-dots i')[0]).toHaveClass('is-active')
    expect(map.querySelectorAll('.cv-main-navigation__mode-dots i')[1]).not.toHaveClass('is-active')

    rerender(<MemoryRouter><MainNavigation activePanel="media" placesPanelCollapsed={false} onPanelChange={vi.fn()} /></MemoryRouter>)
    expect(screen.getByRole('button', { name: 'Lieux' }).querySelector('.cv-main-navigation__places-default-icon')).toHaveClass('is-visible')
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

  it('keeps desktop Places and Sorties navigation static without mode dots', () => {
    render(<MemoryRouter><MainNavigation activePanel="places" placesPanelCollapsed tripPlanningActive tripTimelineShortcutActive={false} onPanelChange={vi.fn()} /></MemoryRouter>)
    const places = screen.getByRole('button', { name: 'Lieux' })
    const trips = screen.getByRole('button', { name: 'Sorties' })

    expect(places.querySelector('.cv-main-navigation__places-default-icon')).toHaveClass('is-visible')
    expect(places.querySelector('.cv-main-navigation__places-world-map-icon')).not.toHaveClass('is-visible')
    expect(trips.querySelector('.cv-main-navigation__trip-default-icon')).toHaveClass('is-visible')
    expect(trips.querySelector('.cv-main-navigation__trip-timeline-icon')).not.toHaveClass('is-visible')
    expect(places.querySelector('.cv-main-navigation__mode-dots')).not.toBeInTheDocument()
    expect(trips.querySelector('.cv-main-navigation__mode-dots')).not.toBeInTheDocument()
  })

  it('marks only the timeline mode active while trip planning extends the Places workspace on mobile', () => {
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: true }))
    render(<MemoryRouter><MainNavigation activePanel="places" tripPlanningActive onPanelChange={vi.fn()} /></MemoryRouter>)
    const places = screen.getByRole('button', { name: 'Lieux' })
    const trips = screen.getByRole('button', { name: 'Chronologie' })
    const media = screen.getByRole('button', { name: 'Médias' })
    const categories = screen.getByRole('button', { name: 'Catégories' })
    expect(trips).toHaveAttribute('aria-pressed', 'true')
    expect(places).toHaveAttribute('aria-pressed', 'false')
    expect(places.compareDocumentPosition(trips) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(trips.compareDocumentPosition(media) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(media.compareDocumentPosition(categories) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(trips.compareDocumentPosition(categories) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('shows the current Sorties or timeline mode while toggling between them', () => {
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: true }))
    const onOpenTrips = vi.fn()
    const { rerender } = render(<MemoryRouter><MainNavigation activePanel="places" tripPlanningActive tripTimelineShortcutActive onPanelChange={vi.fn()} onOpenTrips={onOpenTrips} /></MemoryRouter>)

    const timeline = screen.getByRole('button', { name: 'Sorties' })
    expect(timeline).toHaveTextContent('Sorties')
    expect(timeline.querySelector('.cv-main-navigation__trip-timeline-icon')).not.toHaveClass('is-visible')
    expect(timeline.querySelector('.cv-main-navigation__trip-default-icon')).toHaveClass('is-visible')
    expect(timeline.querySelectorAll('.cv-main-navigation__mode-dots i')[0]).toHaveClass('is-active')
    expect(timeline.querySelectorAll('.cv-main-navigation__mode-dots i')[1]).not.toHaveClass('is-active')
    fireEvent.click(timeline)
    expect(onOpenTrips).toHaveBeenCalledOnce()

    rerender(<MemoryRouter><MainNavigation activePanel="places" tripPlanningActive onPanelChange={vi.fn()} onOpenTrips={onOpenTrips} /></MemoryRouter>)
    const trips = screen.getByRole('button', { name: 'Chronologie' })
    expect(trips).toHaveTextContent('Chronologie')
    expect(trips.querySelector('.cv-main-navigation__trip-default-icon')).not.toHaveClass('is-visible')
    expect(trips.querySelector('.cv-main-navigation__trip-timeline-icon')).toHaveClass('is-visible')
    expect(trips.querySelectorAll('.cv-main-navigation__mode-dots i')[0]).not.toHaveClass('is-active')
    expect(trips.querySelectorAll('.cv-main-navigation__mode-dots i')[1]).toHaveClass('is-active')
  })
})
