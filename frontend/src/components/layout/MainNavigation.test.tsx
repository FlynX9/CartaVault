import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'

import { MainNavigation } from './MainNavigation'
import type { PoiMap } from '../../types/map'

const activeMap = {
  id: 'map-1',
  name: 'France',
  country: { iso_alpha2: 'FR' },
} as PoiMap

describe('MainNavigation', () => {
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('contains only global destinations', () => {
    render(<MemoryRouter><MainNavigation activePanel="places" onPanelChange={vi.fn()} /></MemoryRouter>)

    expect(screen.getByRole('button', { name: 'Accueil' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Mes Cartes' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: 'Médias' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Corbeille' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Lieux' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Mes Sorties' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Organisation' })).not.toBeInTheDocument()
  })

  it('activates My Maps only for the map catalogue', () => {
    const onPanelChange = vi.fn()
    const { rerender } = render(<MemoryRouter><MainNavigation activePanel="places" onPanelChange={onPanelChange} /></MemoryRouter>)

    expect(screen.getByRole('button', { name: 'Mes Cartes' })).toHaveAttribute('aria-pressed', 'false')
    rerender(<MemoryRouter><MainNavigation activePanel="categories" onPanelChange={onPanelChange} /></MemoryRouter>)
    expect(screen.getByRole('button', { name: 'Mes Cartes' })).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(screen.getByRole('button', { name: 'Mes Cartes' }))
    expect(onPanelChange).toHaveBeenCalledWith('maps')
  })

  it('activates global media and trash independently', () => {
    const onPanelChange = vi.fn()
    const { rerender } = render(<MemoryRouter><MainNavigation activePanel="media" onPanelChange={onPanelChange} /></MemoryRouter>)
    expect(screen.getByRole('button', { name: 'Médias' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Mes Cartes' })).toHaveAttribute('aria-pressed', 'false')

    rerender(<MemoryRouter><MainNavigation activePanel="trash" onPanelChange={onPanelChange} /></MemoryRouter>)
    expect(screen.getByRole('button', { name: 'Corbeille' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('opens the dashboard as the only active global entry', () => {
    const onOpenDashboard = vi.fn()
    render(<MemoryRouter><MainNavigation activePanel={null} dashboardActive onPanelChange={vi.fn()} onOpenDashboard={onOpenDashboard} /></MemoryRouter>)
    expect(screen.getByRole('button', { name: 'Accueil' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Mes Cartes' })).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(screen.getByRole('button', { name: 'Accueil' }))
    expect(onOpenDashboard).toHaveBeenCalledOnce()
  })

  it('keeps the desktop collapse control in the desktop component', () => {
    const onCollapsedChange = vi.fn()
    const { unmount } = render(<MemoryRouter><MainNavigation activePanel="maps" onPanelChange={vi.fn()} onCollapsedChange={onCollapsedChange} /></MemoryRouter>)
    fireEvent.click(screen.getByRole('button', { name: 'Réduire le menu' }))
    expect(onCollapsedChange).toHaveBeenCalledWith(true)
    unmount()

    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: true }))
    render(<MemoryRouter><MainNavigation activePanel="maps" onPanelChange={vi.fn()} /></MemoryRouter>)
    expect(screen.getByRole('navigation', { name: 'Navigation CartaVault' })).not.toHaveClass('is-mobile')
    expect(screen.getByRole('button', { name: 'Réduire le menu' })).toBeInTheDocument()
  })

  it('shows the active map in the desktop navigation', () => {
    const onPanelChange = vi.fn()
    render(<MemoryRouter><MainNavigation activePanel="maps" onPanelChange={onPanelChange} maps={[activeMap]} activeMapId={activeMap.id} /></MemoryRouter>)

    const mapEntry = screen.getByRole('button', { name: activeMap.name })
    expect(mapEntry).toBeVisible()
    expect(mapEntry).toHaveTextContent(activeMap.name)
    fireEvent.click(mapEntry)
    expect(onPanelChange).toHaveBeenCalledWith('places')
  })

  it('orders the open map before trips and the open trip', () => {
    render(<MemoryRouter><MainNavigation activePanel="places" onPanelChange={vi.fn()} maps={[activeMap]} activeMapId={activeMap.id} activeTrip={{ id: 'trip-1', name: 'TEST', map_id: activeMap.id }} tripOpen onOpenTrip={vi.fn()} /></MemoryRouter>)

    const buttons = Array.from(document.querySelectorAll('.cv-main-navigation__items > .cv-main-navigation__group:first-child button')).map((button) => button.textContent?.trim())
    expect(buttons.indexOf('Mes Cartes')).toBeLessThan(buttons.indexOf('France'))
    expect(buttons.indexOf('France')).toBeLessThan(buttons.indexOf('Mes Sorties'))
    expect(buttons.indexOf('Mes Sorties')).toBeLessThan(buttons.indexOf('TEST'))
  })

  it('keeps the open trip distinct from the open map', () => {
    render(<MemoryRouter><MainNavigation activePanel="trip" onPanelChange={vi.fn()} maps={[activeMap]} activeMapId={activeMap.id} activeTrip={{ id: 'trip-1', name: 'TEST', map_id: activeMap.id }} tripOpen onOpenTrip={vi.fn()} /></MemoryRouter>)

    expect(screen.getByRole('button', { name: activeMap.name })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: 'TEST' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('does not render an obsolete organization branch', () => {
    render(<MemoryRouter><MainNavigation activePanel="trip" onPanelChange={vi.fn()} /></MemoryRouter>)

    expect(screen.queryByRole('button', { name: 'Organisation' })).not.toBeInTheDocument()
  })

})
