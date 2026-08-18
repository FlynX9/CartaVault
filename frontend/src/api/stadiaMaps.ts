import { getJson } from './client'

export interface StadiaBasemapConfig {
  personal_key_active: boolean
  key_optional: boolean
  tile_path: string
  expires?: string | null
}

export type StadiaBasemapCapability = 'classic_basemap' | 'satellite_basemap'

export const getStadiaBasemapConfig = (capability: StadiaBasemapCapability = 'classic_basemap', signal?: AbortSignal) =>
  getJson('/basemaps/stadia/config', new URLSearchParams({ capability }), signal) as Promise<StadiaBasemapConfig>
