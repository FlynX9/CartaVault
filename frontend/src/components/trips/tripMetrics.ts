const frenchNumber = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 })

export function formatRouteDistance(meters: number | null): string {
  if (meters === null) return '—'
  const kilometers = meters / 1000
  const digits = kilometers < 10 || !Number.isInteger(kilometers) ? 1 : 0
  return `${new Intl.NumberFormat('fr-FR', { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(kilometers)} km`
}

export function formatMinutes(minutes: number | null): string {
  if (minutes === null) return '—'
  const rounded = Math.round(minutes)
  if (rounded < 60) return `${frenchNumber.format(rounded)} min`
  return `${frenchNumber.format(Math.floor(rounded / 60))} h ${String(rounded % 60).padStart(2, '0')}`
}

export function formatRouteDuration(seconds: number | null): string {
  return formatMinutes(seconds === null ? null : seconds / 60)
}
