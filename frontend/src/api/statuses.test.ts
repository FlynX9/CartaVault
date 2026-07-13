import { afterEach, describe, expect, it, vi } from 'vitest'

import { getStatuses, parseStatus } from './statuses'

const STATUS = {
  id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  name: 'À faire',
  slug: 'a-faire',
  color: '#2563EB',
  sort_order: 10,
  is_default: true,
  is_active: true,
  created_at: '2026-07-13T10:00:00',
  updated_at: '2026-07-13T10:00:00',
  places_count: 3,
}

afterEach(() => vi.unstubAllGlobals())

describe('statuses API', () => {
  it('validates the full runtime contract and strict color', () => {
    expect(parseStatus(STATUS)).toEqual(STATUS)
    expect(() => parseStatus({ ...STATUS, color: 'blue' })).toThrow(/couleur/)
  })

  it('requests active statuses and search through the API client', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(new Response(JSON.stringify([STATUS]), { status: 200, headers: { 'Content-Type': 'application/json' } })))
    vi.stubGlobal('fetch', fetchMock)
    expect(await getStatuses(undefined, { q: 'faire', activeOnly: true })).toHaveLength(1)
    const calledUrl = String((fetchMock.mock.calls as unknown[][])[0]?.[0])
    expect(calledUrl).toContain('q=faire')
    expect(calledUrl).toContain('active_only=true')
  })
})
