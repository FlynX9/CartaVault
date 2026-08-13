import { getBlob, getJson, sendJson } from './client'

export type PrivacyAnalyticsMode = 'disabled' | 'privacy_preserving' | 'consent_required'

export interface PrivacySettings {
  analytics_mode: PrivacyAnalyticsMode
  consent_required: boolean
  consent_version: string
  operator_name: string
  privacy_policy_url: string
  cookie_policy_url: string
  contact_email: string
  policy_version: string
  auth_log_retention_days: number
  session_retention_days: number
  deleted_account_retention_days: number
}

export interface PrivacyConsent {
  necessary: true
  analytics: boolean
  functional_optional: boolean
  marketing: boolean
  third_party: boolean
  version: string
  updated_at: string | null
}

const empty = () => new URLSearchParams()

export const getPrivacyConfiguration = (signal?: AbortSignal) => getJson('/privacy/configuration', empty(), signal) as Promise<PrivacySettings>
export const getPrivacyConsent = (signal?: AbortSignal) => getJson('/account/privacy/consent', empty(), signal) as Promise<PrivacyConsent>
export const savePrivacyConsent = (value: Pick<PrivacyConsent, 'analytics' | 'functional_optional' | 'marketing' | 'third_party'>) => sendJson('/account/privacy/consent', 'PUT', value) as Promise<PrivacyConsent>
export const downloadPersonalData = (signal?: AbortSignal) => getBlob('/account/privacy/export', signal)
export const getAdminPrivacySettings = (signal?: AbortSignal) => getJson('/admin/console/privacy/settings', empty(), signal) as Promise<PrivacySettings>
export const saveAdminPrivacySettings = (value: Omit<PrivacySettings, 'consent_required' | 'consent_version'>) => sendJson('/admin/console/privacy/settings', 'PUT', value) as Promise<PrivacySettings>
