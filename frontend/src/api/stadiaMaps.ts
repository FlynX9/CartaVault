import { getJson } from './client'

const empty = () => new URLSearchParams()

export interface StadiaBasemapConfig {
  personal_key_active: boolean
  tile_url: string | null
}

export const getStadiaBasemapConfig = (signal?: AbortSignal) => getJson('/basemaps/stadia/config', empty(), signal) as Promise<StadiaBasemapConfig>
