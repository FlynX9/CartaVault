import { DivIcon } from 'leaflet'

const cache = new Map<string, DivIcon>()

const iconPaths: Record<string, string> = {
  'map-pin': '<path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2"/>',
  factory: '<path d="M3 21h18V9l-7 4V9l-7 4V3H3z"/><path d="M7 21v-5h3v5"/>',
  castle: '<path d="M3 21h18V9l-3 2-3-2-3 2-3-2-3 2z"/><path d="M6 9V4h3v3h6V4h3v5"/>',
  church: '<path d="M12 3v18M8 7h8M6 21h12V11l-6-4-6 4z"/>',
  landmark: '<path d="M3 21h18M5 18h14M6 15h12M7 12h10l-5-7zM8 15v3m4-3v3m4-3v3"/>',
  'building-2': '<rect width="16" height="20" x="4" y="2" rx="1"/><path d="M8 6h.01M12 6h.01M16 6h.01M8 10h.01M12 10h.01M16 10h.01M8 14h.01M12 14h.01M16 14h.01"/>',
  house: '<path d="m3 11 9-8 9 8v10H3z"/><path d="M9 21v-6h6v6"/>',
  mountain: '<path d="m3 20 7-12 4 6 2-3 5 9z"/>',
  'tree-pine': '<path d="m12 3-6 8h4l-5 7h14l-5-7h4zM12 18v3"/>',
  'circle-help': '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.7 2.2c-.8.4-1.2.9-1.2 1.8M12 17h.01"/>',
}

function buildSafeIconSvg(icon: string | null | undefined): string {
  const path = iconPaths[icon ?? ''] ?? iconPaths['circle-help']
  return `<svg class="status-marker-glyph" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`
}

export function getStatusMarkerIcon(color: string, icon: string | null | undefined, selected: boolean): DivIcon {
  const safeColor = /^#[0-9A-F]{6}$/i.test(color) ? color : '#64707A'
  const key = `${safeColor}:${icon ?? 'fallback'}:${selected}`
  const cached = cache.get(key)
  if (cached) return cached
  const size = selected ? 34 : 28
  const markerIcon = new DivIcon({
    className: 'status-marker-container',
    html: `<span class="status-marker${selected ? ' selected' : ''}" style="--marker-color:${safeColor}"><span class="status-marker-glyph-wrap">${buildSafeIconSvg(icon)}</span></span>`,
    iconSize: [size, size + 10],
    iconAnchor: [size / 2, size + 8],
    popupAnchor: [0, -(size + 4)],
  })
  cache.set(key, markerIcon)
  return markerIcon
}
