import { getJson } from './client'
import type { Dashboard } from '../types/dashboard'

export async function getDashboard(signal?: AbortSignal): Promise<Dashboard> {
  return getJson('/dashboard', new URLSearchParams(), signal) as Promise<Dashboard>
}
