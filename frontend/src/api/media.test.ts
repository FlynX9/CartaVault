import { describe, expect, it, vi } from 'vitest'

import { sendFormData } from './client'
import { uploadMedia } from './media'

vi.mock('./client', () => ({
  getJson: vi.fn(),
  sendFormData: vi.fn().mockResolvedValue({ id: 'media-1' }),
  sendJson: vi.fn(),
  sendWithoutResponse: vi.fn(),
}))

describe('uploadMedia', () => {
  it('sends the selected map id in the multipart payload', async () => {
    const file = new File(['photo'], 'photo.png', { type: 'image/png' })
    await uploadMedia(file, null, undefined, undefined, 'map-b')

    expect(sendFormData).toHaveBeenCalledWith('/media-actions/upload', 'POST', expect.any(FormData))
    const payload = vi.mocked(sendFormData).mock.calls[0]![2]
    expect(payload.get('map_id')).toBe('map-b')
    expect(payload.get('file')).toBe(file)
  })
})
