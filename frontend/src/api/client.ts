import { API_BASE_URL } from '../config'

export type ApiFieldErrors = Record<string, string>

export class ApiError extends Error {
  readonly status: number
  readonly fieldErrors: ApiFieldErrors

  constructor(
    status: number,
    message: string,
    fieldErrors: ApiFieldErrors = {},
  ) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.fieldErrors = fieldErrors
  }
}

interface ParsedErrorPayload {
  message: string | null
  fieldErrors: ApiFieldErrors
}

function parseApiErrorPayload(payload: unknown): ParsedErrorPayload {
  if (typeof payload !== 'object' || payload === null || !('detail' in payload)) {
    return { message: null, fieldErrors: {} }
  }

  const detail = payload.detail

  if (typeof detail === 'string') {
    return { message: detail, fieldErrors: {} }
  }

  if (!Array.isArray(detail)) {
    return { message: null, fieldErrors: {} }
  }

  const messages: string[] = []
  const fieldErrors: ApiFieldErrors = {}

  for (const item of detail) {
    if (
      typeof item !== 'object' ||
      item === null ||
      !('msg' in item) ||
      typeof item.msg !== 'string'
    ) {
      continue
    }

    messages.push(item.msg)

    if ('loc' in item && Array.isArray(item.loc)) {
      const field = item.loc.at(-1)

      if (typeof field === 'string') {
        fieldErrors[field] = item.msg
      }
    }
  }

  return {
    message: messages.length > 0 ? messages.join(', ') : null,
    fieldErrors,
  }
}

async function getResponseError(response: Response): Promise<ParsedErrorPayload> {
  const fallback = `L'API a répondu avec le statut ${response.status}.`

  try {
    const payload: unknown = await response.clone().json()
    const parsed = parseApiErrorPayload(payload)
    return {
      message: parsed.message ?? fallback,
      fieldErrors: parsed.fieldErrors,
    }
  } catch {
    const text = (await response.text()).trim()
    return { message: text || fallback, fieldErrors: {} }
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'
  searchParams?: URLSearchParams
  body?: unknown
  signal?: AbortSignal
}

async function request(
  path: string,
  options: RequestOptions,
): Promise<Response> {
  const query = options.searchParams?.toString() ?? ''
  const headers: Record<string, string> = {
    Accept: 'application/json',
  }

  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json'
  }

  const response = await fetch(
    `${API_BASE_URL}${path}${query ? `?${query}` : ''}`,
    {
      method: options.method ?? 'GET',
      headers,
      body:
        options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: options.signal,
    },
  )

  if (!response.ok) {
    const error = await getResponseError(response)
    throw new ApiError(
      response.status,
      error.message ?? 'Erreur API.',
      error.fieldErrors,
    )
  }

  return response
}

export async function getJson(
  path: string,
  searchParams: URLSearchParams,
  signal?: AbortSignal,
): Promise<unknown> {
  const response = await request(path, { searchParams, signal })
  return response.json()
}

export async function sendJson(
  path: string,
  method: 'POST' | 'PATCH',
  body: unknown,
  signal?: AbortSignal,
): Promise<unknown> {
  const response = await request(path, { method, body, signal })
  return response.json()
}

export async function sendWithoutResponse(
  path: string,
  method: 'DELETE',
  signal?: AbortSignal,
): Promise<void> {
  await request(path, { method, signal })
}
