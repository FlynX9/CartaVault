import { getJson } from './client'
import type { RoutingProvidersResponse } from '../types/account'

export async function getRoutingProviders(signal?: AbortSignal): Promise<RoutingProvidersResponse> {
  return getJson('/routing/providers', new URLSearchParams(), signal) as Promise<RoutingProvidersResponse>
}
