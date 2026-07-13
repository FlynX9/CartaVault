import { DivIcon } from 'leaflet'

const cache = new Map<string, DivIcon>()

export function getStatusMarkerIcon(color: string, selected: boolean): DivIcon {
  const key = `${color}:${selected}`
  const cached = cache.get(key)
  if (cached) return cached
  const size = selected ? 34 : 28
  const icon = new DivIcon({
    className: 'status-marker-container',
    html: `<span class="status-marker${selected ? ' selected' : ''}" style="--marker-color:${color}"></span>`,
    iconSize: [size, size + 10],
    iconAnchor: [size / 2, size + 8],
    popupAnchor: [0, -(size + 4)],
  })
  cache.set(key, icon)
  return icon
}
