export function readMapId(search: string): string | null {
  const value = new URLSearchParams(search).get('map')?.trim()
  return value || null
}

export function withMap(pathname: string, mapId: string | null): string {
  if (mapId === null) return pathname
  return `${pathname}?${new URLSearchParams({ map: mapId })}`
}
