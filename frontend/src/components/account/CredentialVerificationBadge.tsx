import { useEffect, useState } from 'react'

import { formatCredentialDate } from './credentialDate'
import { clearCredentialIssue } from '../notifications/important'

interface CredentialVerificationStatus {
  configured: boolean
  verified: boolean
  verified_at: string | null
  last_error_code: string | null
}

const storageKey = (provider: string, last4: string | null) => `cartavault:credential-error-at:${provider}:${last4 ?? 'unknown'}`
const verificationChangedEvent = 'cartavault:credential-verification-changed'

export function useCredentialVerificationState(provider: string, last4: string | null, lastErrorCode: string | null) {
  const key = storageKey(provider, last4)
  const [failedAt, setFailedAt] = useState<string | null>(() => window.localStorage.getItem(key))

  useEffect(() => {
    if (lastErrorCode === null) {
      window.localStorage.removeItem(key)
      setFailedAt(null)
      return
    }
    const recorded = window.localStorage.getItem(key) ?? new Date().toISOString()
    window.localStorage.setItem(key, recorded)
    setFailedAt(recorded)
  }, [key, lastErrorCode])

  useEffect(() => {
    const synchronize = (event: Event) => {
      const detail = (event as CustomEvent<{ key: string; failedAt: string | null }>).detail
      if (detail?.key === key) setFailedAt(detail.failedAt)
    }
    window.addEventListener(verificationChangedEvent, synchronize)
    return () => window.removeEventListener(verificationChangedEvent, synchronize)
  }, [key])

  return {
    failedAt,
    markVerificationFailed: () => {
      const recorded = new Date().toISOString()
      window.localStorage.setItem(key, recorded)
      setFailedAt(recorded)
      window.dispatchEvent(new CustomEvent(verificationChangedEvent, { detail: { key, failedAt: recorded } }))
    },
    clearVerificationFailure: () => {
      window.localStorage.removeItem(key)
      setFailedAt(null)
      window.dispatchEvent(new CustomEvent(verificationChangedEvent, { detail: { key, failedAt: null } }))
      clearCredentialIssue(provider)
    },
  }
}

export function CredentialVerificationBadge({ status, failedAt }: { status: CredentialVerificationStatus; failedAt: string | null }) {
  if (!status.configured) return null
  if (status.verified) return <span className="account-credential__verification"><span className="account-credential__status">Vérifiée</span>{status.verified_at && <time dateTime={status.verified_at}>{formatCredentialDate(status.verified_at)}</time>}</span>
  if (status.last_error_code || failedAt) return <span className="account-credential__verification"><span className="account-credential__status is-error">Erreur</span>{failedAt && <time dateTime={failedAt}>{formatCredentialDate(failedAt)}</time>}</span>
  return null
}

export function CredentialGroupVerificationBadge({ provider, status }: { provider: string; status: CredentialVerificationStatus & { last4: string | null } }) {
  const verification = useCredentialVerificationState(provider, status.last4, status.last_error_code)
  return <CredentialVerificationBadge status={status} failedAt={verification.failedAt} />
}
