import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { getAccountPreferences, updateAccountPreferences } from '../../api/account'
import { OnboardingCard } from './OnboardingCard'

vi.mock('../../api/account', () => ({ getAccountPreferences: vi.fn(), updateAccountPreferences: vi.fn() }))

const preferences = { language: 'fr' as const, default_theme: 'system' as const, preferred_basemap: 'cartavault-light' as const, density: 'compact' as const, startup_panel: 'maps' as const, timezone: 'Europe/Paris', trash_retention_days: 30, photo_markers_enabled: false, routing: { provider: 'osrm' as const }, places: { provider: 'stadia' as const }, onboarding: { dismissed: false, completed_steps: [] as Array<'map' | 'place' | 'import' | 'trip' | 'organization'> } }
const dashboard = { summary: { places: 0, trips: 0 } } as never
const map = { id: 'map-1', can_edit: true } as never

beforeEach(() => {
  vi.mocked(getAccountPreferences).mockResolvedValue(preferences)
  vi.mocked(updateAccountPreferences).mockImplementation(async (value) => value)
})

describe('OnboardingCard', () => {
  it('can be skipped and resumed without blocking the dashboard', async () => {
    render(<OnboardingCard maps={[]} dashboard={dashboard} onCreateMap={vi.fn()} onCreatePlace={vi.fn()} onImportKmz={vi.fn()} onCreateTrip={vi.fn()} />)
    expect(await screen.findByRole('heading', { name: 'Configurez votre premier voyage' })).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Passer le guide' }))
    await waitFor(() => expect(updateAccountPreferences).toHaveBeenCalledWith(expect.objectContaining({ onboarding: expect.objectContaining({ dismissed: true }) })))
    expect(screen.queryByRole('button', { name: 'Reprendre le guide de démarrage' })).not.toBeInTheDocument()
  })

  it('opens the import flow and persists the exploration step', async () => {
    const onImportKmz = vi.fn()
    render(<OnboardingCard maps={[map]} dashboard={dashboard} onCreateMap={vi.fn()} onCreatePlace={vi.fn()} onImportKmz={onImportKmz} onCreateTrip={vi.fn()} />)
    await screen.findByRole('heading', { name: 'Configurez votre premier voyage' })
    fireEvent.click(screen.getByText('Importez vos données').closest('li')!.querySelector('button')!)
    expect(onImportKmz).toHaveBeenCalledWith('map-1')
    await waitFor(() => expect(updateAccountPreferences).toHaveBeenCalledWith(expect.objectContaining({ onboarding: expect.objectContaining({ completed_steps: expect.arrayContaining(['import']) }) })))
  })
})
