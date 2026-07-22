import type { StyleSpecification, VectorSourceSpecification } from 'maplibre-gl'

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
  tileJsonUrl: string,
  glyphsUrl: string,
  signal?: AbortSignal,
): Promise<StyleSpecification> {
  const response = await fetch(styleUrl, { signal })
  if (!response.ok) throw new Error(`Unable to load basemap style (${response.status})`)

  const payload: unknown = await response.json()
  if (!isStyleSpecification(payload)) throw new Error('Invalid MapLibre style document')

  const style = structuredClone(payload)
  const source = style.sources.openmaptiles
  if (source?.type !== 'vector') throw new Error('The CartaVault style must define the openmaptiles vector source')

  const vectorSource = source as VectorSourceSpecification
  vectorSource.url = tileJsonUrl
  style.glyphs = glyphsUrl
  return style
}
