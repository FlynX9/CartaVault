import { API_BASE_URL } from '../config'
import { announceApiMutationFailure, announceApiMutationStart, announceApiMutationSuccess } from './mutationEvents'
import type { ApiMutationEventDetail } from './mutationEvents'
import { reportCredentialIssue } from '../components/notifications/important'

export type ApiFieldErrors = Record<string, string>

export class ApiError extends Error {
  readonly status: number
  readonly fieldErrors: ApiFieldErrors
  readonly code: string | null
  readonly detail: unknown

  constructor(
    status: number,
    message: string,
    fieldErrors: ApiFieldErrors = {},
    code: string | null = null,
    detail: unknown = null,
  ) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.fieldErrors = fieldErrors
    this.code = code
    this.detail = detail
  }
}

let csrfToken: string | null = null
const trackedMutations = new WeakMap<Response, ApiMutationEventDetail>()
export const SESSION_EXPIRED_EVENT = 'cartavault:session-expired'

function reportCredentialRequestFailure(path: string, code: string | null) {
  if (path.includes('/verify') || code === null) return
  const provider = code.startsWith('GOOGLE_ROUTES_') ? 'google_routes'
    : code.startsWith('GOOGLE_PLACES_') ? 'google_places'
      : code.startsWith('OPENROUTESERVICE_') || code.startsWith('ORS_') ? 'openrouteservice'
        : code.startsWith('GOOGLE_MAPS_JS_') ? 'google_maps_js'
            : code.startsWith('STADIA_PLACES_') ? 'stadia_places'
              : null
  if (provider) reportCredentialIssue(provider, `La clé API ${providerLabel(provider)} ne fonctionne plus. Vérifiez-la ou remplacez-la.`)
}

function providerLabel(provider: string) {
  return ({ google_routes: 'Google Routes', google_places: 'Google Places', openrouteservice: 'OpenRouteService', google_maps_js: 'Google Maps JavaScript', stadia_places: 'Stadia Places' } as Record<string, string>)[provider] ?? provider
}

export function setCsrfToken(value: string | null): void {
  csrfToken = value
}

function synchronizeCsrfToken(response: Response): void {
  const rotatedToken = response.headers.get('X-CSRF-Token')
  if (rotatedToken !== null) setCsrfToken(rotatedToken)
}

interface ParsedErrorPayload {
  message: string | null
  fieldErrors: ApiFieldErrors
  code: string | null
  detail: unknown
}

function parseApiErrorPayload(payload: unknown): ParsedErrorPayload {
  if (typeof payload !== 'object' || payload === null || !('detail' in payload)) {
    return { message: null, fieldErrors: {}, code: null, detail: null }
  }

  const detail = payload.detail

  if (typeof detail === 'string') {
    return { message: detail, fieldErrors: {}, code: null, detail }
  }

  if (typeof detail === 'object' && detail !== null && 'message' in detail && typeof detail.message === 'string') {
    return {
      message: detail.message,
      fieldErrors: {},
      code: 'code' in detail && typeof detail.code === 'string' ? detail.code : null,
      detail,
    }
  }

  if (!Array.isArray(detail)) {
    return { message: null, fieldErrors: {}, code: null, detail }
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
    code: null,
    detail,
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
      code: parsed.code,
      detail: parsed.detail,
    }
  } catch {
    const text = (await response.text()).trim()
    return { message: text || fallback, fieldErrors: {}, code: null, detail: null }
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'
  searchParams?: URLSearchParams
  body?: unknown
  signal?: AbortSignal
}

async function request(
  path: string,
  options: RequestOptions,
): Promise<Response> {
  const method = options.method ?? 'GET'
  const mutation = method === 'GET' ? null : announceApiMutationStart(method, path)
  if (method !== 'GET' && typeof navigator !== 'undefined' && navigator.onLine === false) {
    if (mutation) announceApiMutationFailure(mutation)
    throw new ApiError(0, 'Cette action nécessite une connexion Internet. Les données hors ligne sont en lecture seule.')
  }
  const query = options.searchParams?.toString() ?? ''
  const headers: Record<string, string> = {
    Accept: 'application/json',
  }

  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json'
  }
  if (options.method !== undefined && options.method !== 'GET' && csrfToken !== null) {
    headers['X-CSRF-Token'] = csrfToken
  }

  try {
    const response = await fetch(
      `${API_BASE_URL}${path}${query ? `?${query}` : ''}`,
      {
        method,
        headers,
        cache: 'no-store',
        body:
          options.body === undefined ? undefined : JSON.stringify(options.body),
        signal: options.signal,
        credentials: 'include',
      },
    )

    if (!response.ok) {
      const error = await getResponseError(response)
      reportCredentialRequestFailure(path, error.code)
      if (response.status === 401 && path !== '/auth/login' && path !== '/auth/me') {
        setCsrfToken(null)
        window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT))
      }
      throw new ApiError(
        response.status,
        error.message ?? 'Erreur API.',
        error.fieldErrors,
        error.code,
        error.detail,
      )
    }

    synchronizeCsrfToken(response)
    if (mutation) trackedMutations.set(response, mutation)
    return response
  } catch (error) {
    if (mutation) announceApiMutationFailure(mutation)
    throw error
  }
}

async function completeResponse<T>(response: Response, consume: () => Promise<T>): Promise<T> {
  const mutation = trackedMutations.get(response)
  try {
    const result = await consume()
    if (mutation) announceApiMutationSuccess(mutation)
    return result
  } catch (error) {
    if (mutation) announceApiMutationFailure(mutation)
    throw error
  } finally {
    trackedMutations.delete(response)
  }
}

export async function getJson(
  path: string,
  searchParams: URLSearchParams,
  signal?: AbortSignal,
): Promise<unknown> {
  const response = await request(path, { searchParams, signal })
  return completeResponse(response, () => response.json())
}

export async function sendJson(
  path: string,
  method: 'POST' | 'PATCH' | 'PUT' | 'DELETE',
  body: unknown,
  signal?: AbortSignal,
): Promise<unknown> {
  const response = await request(path, { method, body, signal })
  return completeResponse(response, () => response.json())
}

export function sendJsonViaXhr(
  path: string,
  method: 'POST',
  body: unknown,
): Promise<unknown> {
  const mutation = announceApiMutationStart(method, path)
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    announceApiMutationFailure(mutation)
    return Promise.reject(new ApiError(0, 'Cette action nécessite une connexion Internet. Les données hors ligne sont en lecture seule.'))
  }
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open(method, `${API_BASE_URL}${path}`)
    xhr.withCredentials = true
    xhr.setRequestHeader('Accept', 'application/json')
    xhr.setRequestHeader('Content-Type', 'application/json')
    if (csrfToken !== null) xhr.setRequestHeader('X-CSRF-Token', csrfToken)
    const fail = (error: ApiError) => { announceApiMutationFailure(mutation); reject(error) }
    xhr.onerror = () => fail(new ApiError(0, 'La requête API a échoué.'))
    xhr.onload = () => {
      let payload: unknown = null
      try { payload = xhr.responseText ? JSON.parse(xhr.responseText) : null } catch { payload = null }
      if (xhr.status < 200 || xhr.status >= 300) {
        const parsed = parseApiErrorPayload(payload)
        reportCredentialRequestFailure(path, parsed.code)
        if (xhr.status === 401) { setCsrfToken(null); window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT)) }
        fail(new ApiError(xhr.status, parsed.message ?? `L'API a répondu avec le statut ${xhr.status}.`, parsed.fieldErrors, parsed.code))
        return
      }
      const rotatedToken = xhr.getResponseHeader('X-CSRF-Token')
      if (rotatedToken !== null) setCsrfToken(rotatedToken)
      announceApiMutationSuccess(mutation)
      resolve(payload)
    }
    xhr.send(JSON.stringify(body))
  })
}

export async function sendWithoutResponse(
  path: string,
  method: 'POST' | 'DELETE',
  signal?: AbortSignal,
): Promise<void> {
  const response = await request(path, { method, signal })
  await completeResponse(response, async () => undefined)
}

export async function sendBodyWithoutResponse(
  path: string,
  method: 'POST' | 'PATCH' | 'DELETE',
  body: unknown,
  signal?: AbortSignal,
): Promise<void> {
  const response = await request(path, { method, body, signal })
  await completeResponse(response, async () => undefined)
}

export async function getBlob(path: string, signal?: AbortSignal): Promise<Blob> {
  const response = await request(path, { signal })
  return completeResponse(response, () => response.blob())
}

export async function sendFormData(
  path: string,
  method: 'POST',
  body: FormData,
  signal?: AbortSignal,
): Promise<unknown> {
  const mutation = announceApiMutationStart(method, path)
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    announceApiMutationFailure(mutation)
    throw new ApiError(0, 'Cette action nécessite une connexion Internet. Les données hors ligne sont en lecture seule.')
  }
  try {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      body,
      signal,
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        ...(csrfToken === null ? {} : { 'X-CSRF-Token': csrfToken }),
      },
    })
    if (!response.ok) {
      const error = await getResponseError(response)
      if (response.status === 401) {
        setCsrfToken(null)
        window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT))
      }
      throw new ApiError(response.status, error.message ?? 'Erreur API.', error.fieldErrors, error.code)
    }
    synchronizeCsrfToken(response)
    const payload: unknown = await response.json()
    announceApiMutationSuccess(mutation)
    return payload
  } catch (error) {
    announceApiMutationFailure(mutation)
    throw error
  }
}
