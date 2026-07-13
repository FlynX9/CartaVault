import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

import { PlaceDetailsPage } from './PlaceDetailsPage'

const PLACE_ID = '11111111-1111-4111-8111-111111111111'

const PLACE_RESPONSE = {
  id: PLACE_ID,
  name: 'Ancienne manufacture',
  description: 'Un bâtiment industriel remarquable.',
  country: 'France',
  region: 'Grand Est',
  construction_date: '1890',
  abandonment_date: null,
  condition: 'Dégradé',
  access: 'Interdit',
  danger_level: 'Élevé',
  longitude: 6.45,
  latitude: 48.17,
  categories: [],
  tags: [],
  created_at: '2026-07-13T10:00:00',
  updated_at: '2026-07-13T11:00:00',
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function renderDetailsPage(onPlaceDeleted?: (placeId: string) => void) {
  render(
    <MemoryRouter initialEntries={[`/places/${PLACE_ID}`]}>
      <Routes>
        <Route path="/places/:placeId" element={<PlaceDetailsPage onPlaceDeleted={onPlaceDeleted} />} />
      </Routes>
    </MemoryRouter>,
  )
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('PlaceDetailsPage', () => {
  it('renders detailed data and the empty photo state independently', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input)
        return Promise.resolve(
          url.endsWith('/photos')
            ? jsonResponse([])
            : jsonResponse(PLACE_RESPONSE),
        )
      }),
    )

    renderDetailsPage()

    expect(
      await screen.findByRole('heading', { name: 'Ancienne manufacture' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Un bâtiment industriel remarquable.')).toBeVisible()
    expect(screen.queryByText('Adresse')).not.toBeInTheDocument()
    expect(screen.queryByText('Propriétaire')).not.toBeInTheDocument()
    expect(await screen.findByText('Aucune photo pour ce POI.')).toBeVisible()
    const googleMapsLink = screen.getByRole('link', { name: 'Ouvrir Ancienne manufacture dans Google Maps' })
    expect(googleMapsLink).toHaveAttribute('href', 'https://www.google.com/maps/search/?api=1&query=48.17%2C6.45')
    expect(googleMapsLink).toHaveAttribute('target', '_blank')
    expect(googleMapsLink).toHaveAttribute('rel', 'noopener noreferrer')
  })

  it('shows a clear page when the API returns 404', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input)
        return Promise.resolve(
          url.endsWith('/photos')
            ? jsonResponse([])
            : jsonResponse({ detail: 'Place was not found' }, 404),
        )
      }),
    )

    renderDetailsPage()

    expect(
      await screen.findByRole('heading', { name: 'POI introuvable' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Retour à la carte/ })).toHaveAttribute(
      'href',
      '/',
    )
  })

  it('keeps textual details visible when photos fail', async () => {
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => Promise.resolve(
      String(input).endsWith('/photos')
        ? jsonResponse({ detail: 'Photos unavailable' }, 500)
        : jsonResponse(PLACE_RESPONSE),
    )))

    renderDetailsPage()

    expect(await screen.findByRole('heading', { name: 'Ancienne manufacture' })).toBeVisible()
    expect(await screen.findByText('Les photos ne sont pas disponibles.')).toBeVisible()
  })

  it('hides Google Maps when coordinates are missing', async () => {
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => Promise.resolve(
      String(input).endsWith('/photos')
        ? jsonResponse([])
        : jsonResponse({ ...PLACE_RESPONSE, latitude: null, longitude: null }),
    )))

    renderDetailsPage()
    await screen.findByRole('heading', { name: 'Ancienne manufacture' })
    expect(screen.queryByRole('link', { name: 'Ouvrir Ancienne manufacture dans Google Maps' })).not.toBeInTheDocument()
  })

  it('requires confirmation before deleting and reports the deletion', async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'DELETE') return Promise.resolve(new Response(null, { status: 204 }))
      return Promise.resolve(String(input).endsWith('/photos') ? jsonResponse([]) : jsonResponse(PLACE_RESPONSE))
    })
    vi.stubGlobal('fetch', fetchMock)
    vi.stubGlobal('confirm', vi.fn(() => true))
    const onPlaceDeleted = vi.fn()
    renderDetailsPage(onPlaceDeleted)

    fireEvent.click(await screen.findByRole('button', { name: 'Supprimer' }))

    expect(window.confirm).toHaveBeenCalledWith('Supprimer « Ancienne manufacture » ?')
    await waitFor(() => expect(onPlaceDeleted).toHaveBeenCalledWith(PLACE_ID))
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining(`/places/${PLACE_ID}`),
      expect.objectContaining({ method: 'DELETE' }),
    )
  })
})
