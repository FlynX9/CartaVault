export function readMapId(search: string): string | null {
  const value = new URLSearchParams(search).get('map')?.trim()
  return value || null
}

export function readStatusId(search: string): string | null {
  const value = new URLSearchParams(search).get('status')?.trim()
  return value || null
}

export function withMap(pathname: string, mapId: string | null | undefined, statusId: string | null = null): string {
  const params = new URLSearchParams()
  if (mapId) params.set('map', mapId)
  if (statusId !== null) params.set('status', statusId)
  const query = params.toString()
  return query ? `${pathname}?${query}` : pathname
}
