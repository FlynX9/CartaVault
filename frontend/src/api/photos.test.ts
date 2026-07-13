import { describe, expect, it } from 'vitest'

import { getPhotoFileUrl, parsePhotosResponse } from './photos'

const PLACE_ID = '11111111-1111-4111-8111-111111111111'
const PHOTO_ID = '44444444-4444-4444-8444-444444444444'

describe('photo response validation', () => {
  it('validates PhotoRead and builds the public file URL from its UUID', () => {
    const photos = parsePhotosResponse([
      {
        id: PHOTO_ID,
        place_id: PLACE_ID,
        filename: `${PHOTO_ID}.jpg`,
        original_name: 'manufacture.jpg',
        path: `${PLACE_ID}/${PHOTO_ID}.jpg`,
        description: 'Façade principale',
        taken_at: '2026-07-13',
        created_at: '2026-07-13T10:00:00',
      },
    ])

    expect(photos[0]?.path).toContain(PLACE_ID)
    expect(getPhotoFileUrl(PHOTO_ID)).toBe(
      `http://127.0.0.1:8000/photos/${PHOTO_ID}/file`,
    )
  })

  it('rejects an invalid photo date', () => {
    expect(() =>
      parsePhotosResponse([
        {
          id: PHOTO_ID,
          place_id: PLACE_ID,
          filename: 'photo.jpg',
          original_name: null,
          path: null,
          description: null,
          taken_at: '13/07/2026',
          created_at: null,
        },
      ]),
    ).toThrow(/taken_at/)
  })
})
