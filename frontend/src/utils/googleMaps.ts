export function buildGoogleMapsUrl(
  latitude: number | null,
  longitude: number | null,
): string | null {
  if (latitude === null || longitude === null) return null

  const url = new URL('https://www.google.com/maps/search/')
  url.searchParams.set('api', '1')
  url.searchParams.set('query', `${latitude},${longitude}`)
  return url.toString()
}
