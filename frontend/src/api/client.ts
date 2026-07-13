import { API_BASE_URL } from '../config'

export class ApiError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

function describeApiError(payload: unknown): string | null {
  if (typeof payload !== 'object' || payload === null || !('detail' in payload)) {
    return null
  }

  const detail = payload.detail

  if (typeof detail === 'string') {
    return detail
  }

  if (Array.isArray(detail)) {
    const messages = detail.flatMap((item) => {
      if (
        typeof item === 'object' &&
        item !== null &&
        'msg' in item &&
        typeof item.msg === 'string'
      ) {
        return [item.msg]
      }

      return []
    })

    return messages.length > 0 ? messages.join(', ') : null
  }

  return null
}

async function getResponseError(response: Response): Promise<string> {
  const fallback = `L'API a répondu avec le statut ${response.status}.`

  try {
    const payload: unknown = await response.clone().json()
    return describeApiError(payload) ?? fallback
  } catch {
    const text = (await response.text()).trim()
    return text || fallback
  }
}

export async function getJson(
  path: string,
  searchParams: URLSearchParams,
  signal: AbortSignal,
): Promise<unknown> {
  const query = searchParams.toString()
  const response = await fetch(
    `${API_BASE_URL}${path}${query ? `?${query}` : ''}`,
    {
      headers: {
        Accept: 'application/json',
      },
      signal,
    },
  )

  if (!response.ok) {
    throw new ApiError(response.status, await getResponseError(response))
  }

  return response.json()
}
