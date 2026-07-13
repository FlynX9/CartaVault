const DEFAULT_API_BASE_URL = 'http://127.0.0.1:8000'

function normalizeBaseUrl(value: string | undefined): string {
  const configuredUrl = value?.trim() || DEFAULT_API_BASE_URL

  return configuredUrl.replace(/\/+$/, '')
}

export const API_BASE_URL = normalizeBaseUrl(
  import.meta.env.VITE_API_BASE_URL,
)
