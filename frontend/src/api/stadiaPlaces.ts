import { getJson } from './client'

export interface StadiaPlacesConfig { personal_key_active: boolean }

const empty = () => new URLSearchParams()
export const getStadiaPlacesConfig = (signal?: AbortSignal) => getJson('/account/integrations/stadia-places/config', empty(), signal) as Promise<StadiaPlacesConfig>

export interface StadiaPlacesResponse { features: unknown[] }

export function searchStadiaPlaces(parameters: URLSearchParams, signal?: AbortSignal) {
  return getJson('/account/integrations/stadia-places/search', parameters, signal) as Promise<StadiaPlacesResponse>
}

export function reverseStadiaPlaces(parameters: URLSearchParams, signal?: AbortSignal) {
  return getJson('/account/integrations/stadia-places/reverse', parameters, signal) as Promise<StadiaPlacesResponse>
}
