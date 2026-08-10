import { getJson, sendBodyWithoutResponse } from './client'

const empty = () => new URLSearchParams()

export function getSaasStatus(signal?: AbortSignal) {
  return getJson('/saas/status', empty(), signal) as Promise<{ enabled: boolean }>
}

export function sendContactMessage(kind: 'incident' | 'suggestion', message: string) {
  return sendBodyWithoutResponse('/contact', 'POST', { kind, message })
}
