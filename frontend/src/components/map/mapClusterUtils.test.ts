import { describe, expect, it } from 'vitest'

import { clusterMapPlaces } from './mapClusterUtils'
import type { MapPlace } from '../../types/place'

const place = (id: string, latitude: number, longitude: number): MapPlace => ({
  id,
  map_id: '00000000-0000-4000-8000-000000000001',
  name: id,
  latitude,
  longitude,
  status: { id: '00000000-0000-4000-8000-000000000002', color: '#0FA68A' },
  primary_category_icon: null,
  category_ids: [],
  tag_ids: [],
  is_favorite: false,
})

describe('clusterMapPlaces', () => {
  it('groups nearby markers and preserves their exact members', () => {
    const places = [place('a', 48, 2), place('b', 48.001, 2.001), place('c', 49, 3)]
    const clusters = clusterMapPlaces(places, (item) => ({ x: item.longitude * 1_000, y: item.latitude * 1_000 }))
    expect(clusters).toHaveLength(2)
    expect(clusters.find((cluster) => cluster.places.length === 2)?.places.map((item) => item.id)).toEqual(['a', 'b'])
  })

  it('keeps a large input bounded to clusters rather than rendering every marker', () => {
    const places = Array.from({ length: 5_000 }, (_, index) => place(String(index), 48 + (index % 20) * .0001, 2 + (index % 20) * .0001))
    expect(clusterMapPlaces(places, (item) => ({ x: item.longitude * 1_000, y: item.latitude * 1_000 }))).toHaveLength(1)
  })

  it('returns each POI individually when clustering is disabled at the maximum zoom', () => {
    const places = [place('a', 48, 2), place('b', 48, 2)]

    const clusters = clusterMapPlaces(places, (item) => ({ x: item.longitude * 1_000, y: item.latitude * 1_000 }), false)

    expect(clusters).toHaveLength(2)
    expect(clusters.map((cluster) => cluster.places[0].id)).toEqual(['a', 'b'])
  })

  it.each([500, 2_000, 10_000])(
    'clusters %i deterministic markers without blocking navigation',
    (size) => {
      const places = Array.from({ length: size }, (_, index) => place(
        String(index),
        41 + (index % 250) * 0.008,
        -5 + Math.floor(index / 250) * 0.008,
      ))
      const startedAt = performance.now()
      const clusters = clusterMapPlaces(
        places,
        (item) => ({ x: item.longitude * 256, y: item.latitude * 256 }),
      )
      const elapsedMilliseconds = performance.now() - startedAt

      console.info(`[map-cluster-benchmark] markers=${size} clusters=${clusters.length} duration_ms=${elapsedMilliseconds.toFixed(2)}`)
      expect(clusters.length).toBeLessThan(size)
      expect(elapsedMilliseconds).toBeLessThan(250)
    },
  )
})
