import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'

import { MainNavigation } from './MainNavigation'

describe('MainNavigation', () => {
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('contains only global destinations', () => {
    render(<MemoryRouter><MainNavigation activePanel="places" onPanelChange={vi.fn()} /></MemoryRouter>)

    expect(screen.getByRole('button', { name: 'Accueil' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cartes' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Médias' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Corbeille' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Lieux' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Sorties' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Organisation' })).not.toBeInTheDocument()
  })

  it('keeps Maps active throughout a map context', () => {
    const onPanelChange = vi.fn()
    const { rerender } = render(<MemoryRouter><MainNavigation activePanel="places" onPanelChange={onPanelChange} /></MemoryRouter>)

    expect(screen.getByRole('button', { name: 'Cartes' })).toHaveAttribute('aria-pressed', 'true')
    rerender(<MemoryRouter><MainNavigation activePanel="categories" onPanelChange={onPanelChange} /></MemoryRouter>)
    expect(screen.getByRole('button', { name: 'Cartes' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'Cartes' }))
    expect(onPanelChange).toHaveBeenCalledWith('maps')
  })

  it('activates global media and trash independently', () => {
    const onPanelChange = vi.fn()
    const { rerender } = render(<MemoryRouter><MainNavigation activePanel="media" onPanelChange={onPanelChange} /></MemoryRouter>)
    expect(screen.getByRole('button', { name: 'Médias' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Cartes' })).toHaveAttribute('aria-pressed', 'false')

    rerender(<MemoryRouter><MainNavigation activePanel="trash" onPanelChange={onPanelChange} /></MemoryRouter>)
    expect(screen.getByRole('button', { name: 'Corbeille' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('opens the dashboard as the only active global entry', () => {
    const onOpenDashboard = vi.fn()
    render(<MemoryRouter><MainNavigation activePanel={null} dashboardActive onPanelChange={vi.fn()} onOpenDashboard={onOpenDashboard} /></MemoryRouter>)
    expect(screen.getByRole('button', { name: 'Accueil' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Cartes' })).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(screen.getByRole('button', { name: 'Accueil' }))
    expect(onOpenDashboard).toHaveBeenCalledOnce()
  })

  it('delegates the desktop collapse control and omits it on mobile', () => {
    const onCollapsedChange = vi.fn()
    const { unmount } = render(<MemoryRouter><MainNavigation activePanel="maps" onPanelChange={vi.fn()} onCollapsedChange={onCollapsedChange} /></MemoryRouter>)
    fireEvent.click(screen.getByRole('button', { name: 'Réduire le menu' }))
    expect(onCollapsedChange).toHaveBeenCalledWith(true)
    unmount()

    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: true }))
    render(<MemoryRouter><MainNavigation activePanel="maps" onPanelChange={vi.fn()} /></MemoryRouter>)
    expect(screen.getByRole('navigation', { name: 'Navigation CartaVault' })).toHaveClass('is-mobile')
    expect(screen.queryByRole('button', { name: 'Réduire le menu' })).not.toBeInTheDocument()
  })
})
