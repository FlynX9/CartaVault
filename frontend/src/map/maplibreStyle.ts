import type { ExpressionSpecification, StyleSpecification, VectorSourceSpecification } from 'maplibre-gl'

export type MapLabelLanguage = 'fr' | 'en'

const containsCountry = (value: unknown): boolean => value === 'country' || (Array.isArray(value) && value.some(containsCountry))

function localizedCountryField(language: MapLabelLanguage): ExpressionSpecification {
  return ['coalesce', ['get', `name:${language}`], ['get', 'name:latin'], ['get', 'name']]
}

/** Localizes country labels while leaving every other map label unchanged. */
export function localizeCountryNames(style: StyleSpecification, language: MapLabelLanguage): StyleSpecification {
  for (const layer of style.layers) {
    if (layer.type !== 'symbol') continue
    const candidate = layer as typeof layer & { id: string; filter?: unknown; 'source-layer'?: string; layout?: Record<string, unknown> }
    const countryLayer = candidate.id.toLowerCase().includes('country') || containsCountry(candidate.filter)
    if (!countryLayer) continue
    const layout = (candidate.layout ?? (candidate.layout = {})) as Record<string, unknown>
    const localized = localizedCountryField(language)
    const mixedPlaceLayer = candidate['source-layer'] === 'place' && containsCountry(candidate.filter) && !candidate.id.toLowerCase().includes('country')
    layout['text-field'] = mixedPlaceLayer && layout['text-field']
      ? ['case', ['==', ['get', 'class'], 'country'], localized, layout['text-field']]
      : localized
  }
  return style
}

function isStyleSpecification(value: unknown): value is StyleSpecification {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as { version?: unknown; sources?: unknown; layers?: unknown }
  return candidate.version === 8
    && typeof candidate.sources === 'object'
    && candidate.sources !== null
    && Array.isArray(candidate.layers)
}

/** Loads the reviewed local style and swaps only deployment-specific endpoints. */
export async function loadCartaVaultStyle(
  styleUrl: string,
  tileUrl: string,
  glyphsUrl: string,
  signal?: AbortSignal,
  zooms?: { min: number; max: number },
  language: MapLabelLanguage = 'fr',
): Promise<StyleSpecification> {
  const response = await fetch(styleUrl, { signal })
  if (!response.ok) throw new Error(`Unable to load basemap style (${response.status})`)

  const payload: unknown = await response.json()
  if (!isStyleSpecification(payload)) throw new Error('Invalid MapLibre style document')

  const style = structuredClone(payload)
  const source = style.sources.openmaptiles
  if (source?.type !== 'vector') throw new Error('The CartaVault style must define the openmaptiles vector source')

  const vectorSource = source as VectorSourceSpecification
  if (zooms) {
    delete vectorSource.url
    vectorSource.tiles = [tileUrl]
    vectorSource.minzoom = zooms.min
    vectorSource.maxzoom = zooms.max
  } else {
    delete vectorSource.tiles
    vectorSource.url = tileUrl
  }
  style.glyphs = glyphsUrl
  return localizeCountryNames(style, language)
}
