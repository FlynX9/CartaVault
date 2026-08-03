export const API_MUTATION_START_EVENT = 'cartavault:api-mutation-start'
export const API_MUTATION_SUCCESS_EVENT = 'cartavault:api-mutation-success'
export const API_MUTATION_FAILURE_EVENT = 'cartavault:api-mutation-failure'

export interface ApiMutationEventDetail {
  id: string
  method: 'POST' | 'PATCH' | 'PUT' | 'DELETE'
  path: string
}

let mutationSequence = 0

function dispatchMutationEvent(name: string, detail: ApiMutationEventDetail): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent<ApiMutationEventDetail>(name, { detail }))
}

export function announceApiMutationStart(method: ApiMutationEventDetail['method'], path: string): ApiMutationEventDetail {
  const detail = { id: `mutation-${++mutationSequence}`, method, path }
  dispatchMutationEvent(API_MUTATION_START_EVENT, detail)
  return detail
}

export function announceApiMutationSuccess(detail: ApiMutationEventDetail): void {
  dispatchMutationEvent(API_MUTATION_SUCCESS_EVENT, detail)
}

export function announceApiMutationFailure(detail: ApiMutationEventDetail): void {
  dispatchMutationEvent(API_MUTATION_FAILURE_EVENT, detail)
}
