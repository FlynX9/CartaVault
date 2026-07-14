import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getCountries } from '../../api/countries'
import { ApiError } from '../../api/client'
import { createMap } from '../../api/maps'
import { CreateMapDialog } from './CreateMapDialog'

vi.mock('../../api/countries', () => ({ getCountries: vi.fn() }))
vi.mock('../../api/maps', () => ({ createMap: vi.fn() }))
const COUNTRY = { id: 'country-id', name: 'Géorgie', iso_alpha2: 'GE', iso_alpha3: 'GEO' } as never
const MAP = { id: 'map-id', name: 'Géorgie', country: COUNTRY } as never

afterEach(() => { cleanup(); vi.clearAllMocks() })

describe('CreateMapDialog', () => {
  it('searches the world catalogue and creates the selected country map', async () => {
    vi.mocked(getCountries).mockResolvedValue([COUNTRY]); vi.mocked(createMap).mockResolvedValue(MAP); const created = vi.fn()
    render(<CreateMapDialog onClose={vi.fn()} onCreated={created} />)
    expect(screen.getByRole('dialog')).toHaveClass('cv-modal')
    expect(screen.getByRole('dialog').parentElement).toHaveClass('cv-overlay')
    fireEvent.change(screen.getByRole('searchbox', { name: 'Rechercher un pays' }), { target: { value: 'Géo' } })
    expect(await screen.findByRole('option', { name: /Géorgie/ })).toBeVisible()
    fireEvent.click(screen.getByRole('option', { name: /Géorgie/ })); fireEvent.click(screen.getByRole('button', { name: 'Créer la carte' }))
    await waitFor(() => expect(createMap).toHaveBeenCalledWith({ country_id: 'country-id', name: 'Géorgie' })); expect(created).toHaveBeenCalledWith(MAP)
  })

  it('shows the one-map-per-country conflict', async () => {
    vi.mocked(getCountries).mockResolvedValue([COUNTRY]); vi.mocked(createMap).mockRejectedValue(new ApiError(409, 'Conflict'))
    render(<CreateMapDialog onClose={vi.fn()} onCreated={vi.fn()} />)
    fireEvent.click(await screen.findByRole('option', { name: /Géorgie/ })); fireEvent.click(screen.getByRole('button', { name: 'Créer la carte' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Une carte existe déjà pour ce pays.')
  })
})
