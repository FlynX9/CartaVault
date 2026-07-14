export interface MapContextMenuState { latitude: number; longitude: number; containerX: number; containerY: number }

export function formatContextCoordinates(latitude: number, longitude: number): string {
  return `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`
}

export function buildGoogleMapsUrl(latitude: number, longitude: number): string {
  const url = new URL('https://www.google.com/maps/search/')
  url.search = new URLSearchParams({ api: '1', query: `${latitude},${longitude}` }).toString()
  return url.toString()
}
