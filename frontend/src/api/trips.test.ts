import { beforeEach, describe, expect, it, vi } from 'vitest'

import { sendJson } from './client'
import { confirmTripOptimization } from './trips'

vi.mock('./client', () => ({ getJson: vi.fn(), sendJson: vi.fn(), sendWithoutResponse: vi.fn() }))

describe('trip API', () => {
  beforeEach(() => vi.clearAllMocks())

  it('confirms the stored optimization proposal without sending client-owned route data', async () => {
    vi.mocked(sendJson).mockResolvedValue({} as never)
    await confirmTripOptimization('day-1', 'proposal-1')
    expect(sendJson).toHaveBeenCalledOnce()
    expect(sendJson).toHaveBeenCalledWith('/trip-days/day-1/optimize/confirm', 'POST', { proposal_id: 'proposal-1' })
  })
})
