import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

import { PlaceDetailsPage } from './PlaceDetailsPage'

const PLACE_ID = '11111111-1111-4111-8111-111111111111'

const PLACE_RESPONSE = {
  id: PLACE_ID,
  name: 'Ancienne manufacture',
  description: 'Un bâtiment industriel remarquable.',
  address: '1 rue des Forges',
  country: 'France',
  region: 'Grand Est',
  construction_date: '1890',
  abandonment_date: null,
  condition: 'Dégradé',
  access: 'Interdit',
  danger_level: 'Élevé',
  owner: null,
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

function renderDetailsPage() {
  render(
    <MemoryRouter initialEntries={[`/places/${PLACE_ID}`]}>
      <Routes>
        <Route path="/places/:placeId" element={<PlaceDetailsPage />} />
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
    expect(await screen.findByText('Aucune photo pour ce POI.')).toBeVisible()
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
})
