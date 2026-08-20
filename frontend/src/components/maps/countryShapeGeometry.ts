import countryShapeData from './countryShapeData.generated.json'

export type CountryShapeMode = 'mainland' | 'multi-landmass' | 'archipelago'
type Position = [number, number]
type Ring = Position[]
type Polygon = Ring[]
type MultiPolygon = Polygon[]

interface CountryShapeRule {
  mode: CountryShapeMode
  minRelativeArea?: number
  maxParts?: number
  maxDistanceFromMainland?: number
}

export interface NormalizedCountryShape {
  path: string
  mode: CountryShapeMode
  partCount: number
  sourcePartCount: number
  viewBox: '0 0 400 300'
  bounds: { minX: number; minY: number; maxX: number; maxY: number }
}

const VIEWBOX_WIDTH = 400
const VIEWBOX_HEIGHT = 300
const SAFE_WIDTH = VIEWBOX_WIDTH * 0.84
const SAFE_HEIGHT = VIEWBOX_HEIGHT * 0.82

const countryShapeRules: Record<string, CountryShapeRule> = {
  FRA: { mode: 'mainland', maxParts: 1 },
  ITA: { mode: 'multi-landmass', minRelativeArea: 0.05, maxParts: 3 },
  ALA: { mode: 'archipelago', minRelativeArea: 0.007, maxParts: 13, maxDistanceFromMainland: 4.5 },
  BEL: { mode: 'mainland', maxParts: 1 },
  GEO: { mode: 'mainland', maxParts: 1 },
}

const staticGeometries = (countryShapeData as unknown as { geometries: Record<string, MultiPolygon> }).geometries
const normalizedCache = new Map<string, NormalizedCountryShape | null>()

function ringArea(ring: Ring): number {
  if (ring.length < 3) return 0
  const meanLatitude = ring.reduce((sum, point) => sum + point[1], 0) / ring.length
  const longitudeScale = Math.cos(meanLatitude * Math.PI / 180)
  let area = 0
  for (let index = 0; index < ring.length; index += 1) {
    const current = ring[index]
    const next = ring[(index + 1) % ring.length]
    area += current[0] * longitudeScale * next[1] - next[0] * longitudeScale * current[1]
  }
  return Math.abs(area / 2)
}

function polygonArea(polygon: Polygon): number {
  const [outer, ...holes] = polygon
  if (!outer) return 0
  return Math.max(0, ringArea(outer) - holes.reduce((sum, ring) => sum + ringArea(ring), 0))
}

function polygonCenter(polygon: Polygon): Position {
  const ring = polygon[0] ?? []
  if (ring.length === 0) return [0, 0]
  return [
    ring.reduce((sum, point) => sum + point[0], 0) / ring.length,
    ring.reduce((sum, point) => sum + point[1], 0) / ring.length,
  ]
}

function inferMode(polygons: MultiPolygon): CountryShapeMode {
  const areas = polygons.map(polygonArea).sort((left, right) => right - left)
  if (!areas[0]) return 'mainland'
  const significantParts = areas.filter((area) => area / areas[0] >= 0.025).length
  if (significantParts >= 5) return 'archipelago'
  if (significantParts >= 2) return 'multi-landmass'
  return 'mainland'
}

export function selectCountryShapePolygons(countryCode: string, polygons: MultiPolygon): { mode: CountryShapeMode; polygons: MultiPolygon } {
  const sorted = polygons
    .map((polygon) => ({ polygon, area: polygonArea(polygon) }))
    .filter(({ area }) => area > 0)
    .sort((left, right) => right.area - left.area)
  if (sorted.length === 0) return { mode: 'mainland', polygons: [] }

  const code = countryCode.toUpperCase()
  const mode = countryShapeRules[code]?.mode ?? inferMode(polygons)
  const rule = countryShapeRules[code] ?? (mode === 'archipelago'
    ? { mode, minRelativeArea: 0.006, maxParts: 20, maxDistanceFromMainland: 5 }
    : mode === 'multi-landmass'
      ? { mode, minRelativeArea: 0.02, maxParts: 8 }
      : { mode, maxParts: 1 })
  const mainArea = sorted[0].area
  const mainCenter = polygonCenter(sorted[0].polygon)
  const mainRing = sorted[0].polygon[0]
  const mainLongitudeSpan = Math.max(...mainRing.map(([longitude]) => longitude)) - Math.min(...mainRing.map(([longitude]) => longitude))
  const mainLatitudeSpan = Math.max(...mainRing.map(([, latitude]) => latitude)) - Math.min(...mainRing.map(([, latitude]) => latitude))
  const mainSpan = Math.max(mainLongitudeSpan * Math.cos(mainCenter[1] * Math.PI / 180), mainLatitudeSpan, 0.0001)

  const selected = sorted.filter(({ polygon, area }, index) => {
    if (index === 0) return true
    if (mode === 'mainland') return false
    if (area / mainArea < (rule.minRelativeArea ?? 0)) return false
    if (!rule.maxDistanceFromMainland) return true
    const center = polygonCenter(polygon)
    const distance = Math.hypot(
      (center[0] - mainCenter[0]) * Math.cos(mainCenter[1] * Math.PI / 180),
      center[1] - mainCenter[1],
    ) / mainSpan
    return distance <= rule.maxDistanceFromMainland
  }).slice(0, rule.maxParts ?? sorted.length)

  return { mode, polygons: selected.map(({ polygon }) => polygon) }
}

function circularLongitudeAnchor(polygons: MultiPolygon): number {
  const positions = polygons.flat(2)
  const sine = positions.reduce((sum, [longitude]) => sum + Math.sin(longitude * Math.PI / 180), 0)
  const cosine = positions.reduce((sum, [longitude]) => sum + Math.cos(longitude * Math.PI / 180), 0)
  return Math.atan2(sine, cosine) * 180 / Math.PI
}

function unwrapLongitude(longitude: number, anchor: number): number {
  let unwrapped = longitude
  while (unwrapped - anchor > 180) unwrapped -= 360
  while (unwrapped - anchor < -180) unwrapped += 360
  return unwrapped
}

function pathForPolygons(polygons: MultiPolygon): { path: string; bounds: NormalizedCountryShape['bounds'] } | null {
  const positions = polygons.flat(2)
  if (positions.length === 0) return null
  const anchor = circularLongitudeAnchor(polygons)
  const centerLatitude = positions.reduce((sum, [, latitude]) => sum + latitude, 0) / positions.length
  const longitudeScale = Math.max(0.08, Math.cos(centerLatitude * Math.PI / 180))
  const projected = polygons.map((polygon) => polygon.map((ring) => ring.map(([longitude, latitude]) => [
    unwrapLongitude(longitude, anchor) * longitudeScale,
    -latitude,
  ] as Position)))
  const points = projected.flat(2)
  const minSourceX = Math.min(...points.map(([x]) => x))
  const maxSourceX = Math.max(...points.map(([x]) => x))
  const minSourceY = Math.min(...points.map(([, y]) => y))
  const maxSourceY = Math.max(...points.map(([, y]) => y))
  const sourceWidth = Math.max(maxSourceX - minSourceX, 0.0001)
  const sourceHeight = Math.max(maxSourceY - minSourceY, 0.0001)
  const scale = Math.min(SAFE_WIDTH / sourceWidth, SAFE_HEIGHT / sourceHeight)
  const renderedWidth = sourceWidth * scale
  const renderedHeight = sourceHeight * scale
  const offsetX = (VIEWBOX_WIDTH - renderedWidth) / 2
  const offsetY = (VIEWBOX_HEIGHT - renderedHeight) / 2
  const normalize = ([x, y]: Position): Position => [
    offsetX + (x - minSourceX) * scale,
    offsetY + (y - minSourceY) * scale,
  ]
  const path = projected.map((polygon) => polygon.map((ring) => ring.map((point, index) => {
    const [x, y] = normalize(point)
    return `${index === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`
  }).join(' ') + ' Z').join(' ')).join(' ')
  return {
    path,
    bounds: { minX: offsetX, minY: offsetY, maxX: offsetX + renderedWidth, maxY: offsetY + renderedHeight },
  }
}

export function normalizeCountryShape(countryCode: string, geometry = staticGeometries[countryCode.toUpperCase()]): NormalizedCountryShape | null {
  const code = countryCode.toUpperCase()
  if (geometry === staticGeometries[code] && normalizedCache.has(code)) return normalizedCache.get(code) ?? null
  if (!geometry?.length) return null
  const selection = selectCountryShapePolygons(code, geometry)
  const rendered = pathForPolygons(selection.polygons)
  const normalized = rendered ? {
    ...rendered,
    mode: selection.mode,
    partCount: selection.polygons.length,
    sourcePartCount: geometry.length,
    viewBox: '0 0 400 300' as const,
  } : null
  if (geometry === staticGeometries[code]) normalizedCache.set(code, normalized)
  return normalized
}

export function getCountryShapeSource(countryCode: string): string | null {
  const sources = (countryShapeData as unknown as { sources: Record<string, string> }).sources
  return sources[countryCode.toUpperCase()] ?? null
}
