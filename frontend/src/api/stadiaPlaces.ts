import { getJson } from './client'

export interface StadiaPlacesConfig { personal_key_active: boolean; api_key: string | null }

const empty = () => new URLSearchParams()
export const getStadiaPlacesConfig = (signal?: AbortSignal) => getJson('/account/integrations/stadia-places/config', empty(), signal) as Promise<StadiaPlacesConfig>
