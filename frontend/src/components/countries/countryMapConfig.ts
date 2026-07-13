import type { MapView } from '../../types/place'

export interface CountryMapConfig extends MapView {
  bounds?: [[number, number], [number, number]]
}

const FALLBACK_COUNTRY_CONFIG: CountryMapConfig = {
  center: [20, 0],
  zoom: 2,
}

const COUNTRY_CONFIGS: Record<string, CountryMapConfig> = {
  france: {
    center: [46.603354, 1.888334],
    zoom: 6,
    bounds: [[41.2, -5.3], [51.2, 9.7]],
  },
}

export function getCountryMapConfig(country: string): CountryMapConfig {
  return COUNTRY_CONFIGS[country.trim().toLocaleLowerCase('fr')]
    ?? FALLBACK_COUNTRY_CONFIG
}
