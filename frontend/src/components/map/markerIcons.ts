import { DivIcon } from 'leaflet'

import { getCategoryIconData } from '../../icons/categoryIconData'
import { getPhotoThumbnailUrl } from '../../api/photos'

const cache = new Map<string, DivIcon>()
const MAX_CACHED_ICONS = 256

export function invalidateStatusMarkerIcons(iconId: string | null | undefined): void {
  const fragment = `:${iconId ?? 'fallback'}:`
  for (const key of cache.keys()) if (key.includes(fragment)) cache.delete(key)
}

function buildSafeIconSvg(icon: string | null | undefined): string {
  const iconData = getCategoryIconData(icon)
  const left = iconData.left ?? 0
  const top = iconData.top ?? 0
  const width = iconData.width ?? 24
  const height = iconData.height ?? 24
  return `<svg class="status-marker-glyph" viewBox="${left} ${top} ${width} ${height}" width="18" height="18" fill="currentColor" stroke="currentColor" aria-hidden="true">${iconData.body}</svg>`
}

export function getStatusMarkerIcon(color: string, icon: string | null | undefined, selected: boolean, muted = false, favorite = false): DivIcon {
  const safeColor = /^#[0-9A-F]{6}$/i.test(color) ? color : '#64707A'
  const key = `pin:${safeColor}:${icon ?? 'fallback'}:${selected}:${muted}:${favorite}`
  const cached = cache.get(key)
  if (cached) return cached
  const size = selected ? 34 : 28
  const markerIcon = new DivIcon({
    className: 'status-marker-container',
    html: `<span class="status-marker${selected ? ' selected' : ''}${muted ? ' muted' : ''}${favorite ? ' favorite' : ''}" style="--marker-color:${safeColor}"><span class="status-marker-glyph-wrap">${buildSafeIconSvg(icon)}</span></span>`,
    iconSize: [size, size + 10],
    iconAnchor: [size / 2, size + 8],
    popupAnchor: [0, -(size + 4)],
  })
  if (cache.size >= MAX_CACHED_ICONS) cache.delete(cache.keys().next().value as string)
  cache.set(key, markerIcon)
  return markerIcon
}

export function getCircularPoiMarkerIcon(color: string, icon: string | null | undefined, photoId: string | null | undefined, selected: boolean, muted = false, favorite = false): DivIcon {
  const safeColor = /^#[0-9A-F]{6}$/i.test(color) ? color : '#64707A'
  const key = `circle:${safeColor}:${icon ?? 'fallback'}:${photoId ?? 'no-photo'}:${selected}:${muted}:${favorite}`
  const cached = cache.get(key)
  if (cached) return cached
  const size = selected ? 48 : 40
  const content = photoId
    ? `<span class="photo-poi-marker__photo"><img class="photo-poi-marker__backdrop" src="${getPhotoThumbnailUrl(photoId)}" alt="" aria-hidden="true" loading="lazy" /><img class="photo-poi-marker__image" src="${getPhotoThumbnailUrl(photoId)}" alt="" loading="lazy" /></span>`
    : `<span class="photo-poi-marker__glyph">${buildSafeIconSvg(icon)}</span>`
  const markerIcon = new DivIcon({
    className: 'photo-poi-marker-container',
    html: `<span class="photo-poi-marker${selected ? ' selected' : ''}${muted ? ' muted' : ''}${favorite ? ' favorite' : ''}" style="--marker-color:${safeColor}">${content}</span>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -(size / 2 + 6)],
  })
  if (cache.size >= MAX_CACHED_ICONS) cache.delete(cache.keys().next().value as string)
  cache.set(key, markerIcon)
  return markerIcon
}
