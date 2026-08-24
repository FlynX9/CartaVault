export function readMapId(pathname: string): string | null {
  const value = pathname.match(/^\/maps\/([^/]+)/)?.[1]?.trim()
  return value || null
}

export function readStatusId(search: string): string | null {
  const value = new URLSearchParams(search).get('status')?.trim()
  return value || null
}

export function withMap(pathname: string, mapId: string | null | undefined, statusId: string | null = null): string {
  const params = new URLSearchParams()
  if (statusId !== null) params.set('status', statusId)
  const query = params.toString()
  if (!mapId) return query ? `${pathname}?${query}` : pathname
  const suffix = pathname === '/' ? '' : pathname
  const canonicalPath = suffix.startsWith('/places/')
    ? `/maps/${mapId}${suffix}`
    : suffix === '/categories' || suffix === '/tags' || suffix === '/statuses' || suffix === '/annotations'
      ? `/maps/${mapId}${suffix}`
      : `/maps/${mapId}`
  return query ? `${canonicalPath}?${query}` : canonicalPath
}

export function mapPath(mapId: string, suffix = ''): string {
  return `/maps/${mapId}${suffix}`
}
