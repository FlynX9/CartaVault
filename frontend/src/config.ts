export function resolveApiBaseUrl(
  value: string | undefined,
): string {
  const configuredUrl = value?.trim() || '/api'

  return configuredUrl.replace(/\/+$/, '')
}

export const API_BASE_URL = resolveApiBaseUrl(
  import.meta.env.VITE_API_BASE_URL,
)
