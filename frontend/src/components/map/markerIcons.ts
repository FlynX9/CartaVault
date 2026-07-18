import { DivIcon } from 'leaflet'

import { getCategoryIconData } from '../../icons/categoryIconData'

const cache = new Map<string, DivIcon>()
const MAX_CACHED_ICONS = 256

function buildSafeIconSvg(icon: string | null | undefined): string {
  const iconData = getCategoryIconData(icon)
  const left = iconData.left ?? 0
  const top = iconData.top ?? 0
  const width = iconData.width ?? 24
  const height = iconData.height ?? 24
  return `<svg class="status-marker-glyph" viewBox="${left} ${top} ${width} ${height}" width="18" height="18" fill="currentColor" stroke="currentColor" aria-hidden="true">${iconData.body}</svg>`
}

export function getStatusMarkerIcon(color: string, icon: string | null | undefined, selected: boolean, muted = false): DivIcon {
  const safeColor = /^#[0-9A-F]{6}$/i.test(color) ? color : '#64707A'
  const key = `${safeColor}:${icon ?? 'fallback'}:${selected}:${muted}`
  const cached = cache.get(key)
  if (cached) return cached
  const size = selected ? 34 : 28
  const markerIcon = new DivIcon({
    className: 'status-marker-container',
    html: `<span class="status-marker${selected ? ' selected' : ''}${muted ? ' muted' : ''}" style="--marker-color:${safeColor}"><span class="status-marker-glyph-wrap">${buildSafeIconSvg(icon)}</span></span>`,
    iconSize: [size, size + 10],
    iconAnchor: [size / 2, size + 8],
    popupAnchor: [0, -(size + 4)],
  })
  if (cache.size >= MAX_CACHED_ICONS) cache.delete(cache.keys().next().value as string)
  cache.set(key, markerIcon)
  return markerIcon
}
