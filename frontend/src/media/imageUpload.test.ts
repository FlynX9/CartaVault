import { describe, expect, it, vi } from 'vitest'

const gps = vi.fn()
const parse = vi.fn()
vi.mock('exifr', () => ({ gps, parse }))

import { readImageLocation } from './imageUpload'

describe('readImageLocation', () => {
  it('keeps standard EXIF GPS coordinates', async () => {
    gps.mockResolvedValueOnce({ latitude: 43.2965, longitude: 5.3698 })
    const result = await readImageLocation(new File(['photo'], 'marseille.jpg', { type: 'image/jpeg' }))
    expect(result).toEqual({ latitude: 43.2965, longitude: 5.3698 })
    expect(parse).not.toHaveBeenCalled()
  })

  it('falls back to XMP GPS coordinates when EXIF is absent', async () => {
    gps.mockResolvedValueOnce(undefined)
    parse.mockResolvedValueOnce({ GPSLatitude: '41.7151', GPSLongitude: '44.8271' })
    const result = await readImageLocation(new File(['photo'], 'tbilisi.jpg', { type: 'image/jpeg' }))
    expect(result).toEqual({ latitude: 41.7151, longitude: 44.8271 })
  })
})
