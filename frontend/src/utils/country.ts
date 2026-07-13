export function readCountry(search: string): string | null {
  const country = new URLSearchParams(search).get('country')?.trim()
  return country || null
}

export function withCountry(pathname: string, country: string | null): string {
  if (country === null) return pathname
  const searchParams = new URLSearchParams({ country })
  return `${pathname}?${searchParams.toString()}`
}

export function includeActiveCountry(
  countries: string[],
  activeCountry: string | null,
): string[] {
  const values = activeCountry === null ? countries : [...countries, activeCountry]
  const unique = new Map<string, string>()

  for (const country of values) {
    const trimmed = country.trim()
    if (trimmed) unique.set(trimmed.toLocaleLowerCase('fr'), trimmed)
  }

  return [...unique.values()].sort((left, right) =>
    left.localeCompare(right, 'fr', { sensitivity: 'base' }),
  )
}
