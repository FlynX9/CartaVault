import { beforeEach, describe, expect, it, vi } from 'vitest'

import { sendJson } from './client'
import { confirmTripOptimization } from './trips'

vi.mock('./client', () => ({ getJson: vi.fn(), sendJson: vi.fn(), sendWithoutResponse: vi.fn() }))

describe('trip API', () => {
  beforeEach(() => vi.clearAllMocks())

  it('requests atomic confirmation and route recalculation from the backend', async () => {
    vi.mocked(sendJson).mockResolvedValue({} as never)
    await confirmTripOptimization('day-1', ['stop-2', 'stop-1', 'stop-3'])
    expect(sendJson).toHaveBeenCalledOnce()
    expect(sendJson).toHaveBeenCalledWith('/trip-days/day-1/optimize/confirm', 'POST', { stop_ids: ['stop-2', 'stop-1', 'stop-3'] })
  })
})
