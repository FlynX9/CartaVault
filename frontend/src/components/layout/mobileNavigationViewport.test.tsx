import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'

import { MainNavigation } from './MainNavigation'
import { MobileNavigation } from './MobileNavigation'
import { MOBILE_NAVIGATION_MEDIA_QUERY, useMobileNavigationViewport } from './mobileNavigationViewport'

const mode = { kind: 'GLOBAL_MODE', rememberedMapId: null } as const

function NavigationViewportHarness() {
  const isMobile = useMobileNavigationViewport()
  return <MemoryRouter>{isMobile
    ? <MobileNavigation navigationMode={mode} activePanel="places" onPanelChange={vi.fn()} />
    : <MainNavigation activePanel="places" onPanelChange={vi.fn()} />}</MemoryRouter>
}

describe('mobile navigation viewport selection', () => {
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('renders exactly one tree and swaps it when the shared query changes', async () => {
    let mobile = false
    const listeners = new Set<() => void>()
    vi.stubGlobal('matchMedia', vi.fn().mockImplementation((query: string) => ({
      get matches() { return query === MOBILE_NAVIGATION_MEDIA_QUERY && mobile },
      media: query,
      addEventListener: (_event: string, listener: () => void) => {
        if (query === MOBILE_NAVIGATION_MEDIA_QUERY) listeners.add(listener)
      },
      removeEventListener: (_event: string, listener: () => void) => {
        if (query === MOBILE_NAVIGATION_MEDIA_QUERY) listeners.delete(listener)
      },
    })))

    render(<NavigationViewportHarness />)
    expect(screen.getAllByRole('navigation', { name: 'Navigation CartaVault' })).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Réduire le menu' })).toBeInTheDocument()

    mobile = true
    act(() => listeners.forEach((listener) => listener()))

    await waitFor(() => expect(screen.getByRole('navigation', { name: 'Navigation CartaVault' })).toHaveClass('mobile-navigation'))
    expect(screen.getAllByRole('navigation', { name: 'Navigation CartaVault' })).toHaveLength(1)
    expect(screen.queryByRole('button', { name: 'Réduire le menu' })).not.toBeInTheDocument()
  })
})
