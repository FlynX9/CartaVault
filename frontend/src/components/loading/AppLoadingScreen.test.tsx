import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { AppLoadingScreen, useDelayedLoadingScreen } from './AppLoadingScreen'

vi.mock('../../i18n/useI18n', () => ({
  useI18n: () => ({
    t: (key: string) => ({
      'loading.app.title': 'Chargement de CartaVault…',
      'loading.app.subtitle': 'Préparation de votre espace',
      'loading.map.title': 'Préparation de la carte…',
      'loading.map.subtitle': 'Chargement des données cartographiques',
    })[key] ?? key,
  }),
}))

function Delayed({ loading }: { loading: boolean }) {
  return useDelayedLoadingScreen(loading, 250, 500) ? <AppLoadingScreen /> : null
}

describe('AppLoadingScreen', () => {
  afterEach(() => { cleanup(); vi.useRealTimers() })

  it('uses the localised application copy', () => {
    render(<AppLoadingScreen />)
    expect(screen.getByRole('status')).toHaveTextContent('Chargement de CartaVault…')
    expect(screen.getByText('Préparation de votre espace')).toBeInTheDocument()
  })

  it('uses the map copy without inventing progress', () => {
    render(<AppLoadingScreen mode="map" />)
    expect(screen.getByRole('status')).toHaveTextContent('Préparation de la carte…')
    expect(screen.queryByLabelText(/%/)).not.toBeInTheDocument()
  })

  it('does not flash for a short loading state', () => {
    vi.useFakeTimers()
    const view = render(<Delayed loading />)
    act(() => vi.advanceTimersByTime(200))
    view.rerender(<Delayed loading={false} />)
    act(() => vi.runAllTimers())
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('keeps a displayed splash visible for the minimum duration', () => {
    vi.useFakeTimers()
    const view = render(<Delayed loading />)
    act(() => vi.advanceTimersByTime(250))
    expect(screen.getByRole('status')).toBeInTheDocument()
    view.rerender(<Delayed loading={false} />)
    act(() => vi.advanceTimersByTime(499))
    expect(screen.getByRole('status')).toBeInTheDocument()
    act(() => vi.advanceTimersByTime(1))
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})
