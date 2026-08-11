import { CircleAlert, CircleCheck, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { addNotificationHistory } from '../notifications/history'
import { GLOBAL_FEEDBACK_EVENT, type GlobalFeedbackDetail } from './globalFeedback'

type FeedbackKind = 'error' | 'success'

interface FeedbackMessage {
  id: number
  kind: FeedbackKind
  message: string
  actionLabel?: string
  action?: () => void
}

const FEEDBACK_SELECTOR = [
  '[role="alert"]',
  '.form-alert',
  '.field-error',
  '.admin-success',
  '.form-success',
  '.account-success',
].join(',')

function messageText(element: HTMLElement): string {
  const copy = element.cloneNode(true) as HTMLElement
  copy.querySelectorAll('button').forEach((button) => button.remove())
  return (copy.textContent ?? '').replace(/\s+/g, ' ').trim()
}

function isSuccess(element: HTMLElement): boolean {
  return element.matches('.admin-success, .form-success, .account-success, .form-alert.success')
}

export function GlobalFeedbackToasts() {
  const [feedback, setFeedback] = useState<FeedbackMessage | null>(null)
  const sequence = useRef(0)
  const lastFeedback = useRef<{ key: string; at: number } | null>(null)

  const showFeedback = (next: Omit<FeedbackMessage, 'id'>) => {
    const key = `${next.kind}:${next.message}`
    const now = Date.now()
    if (lastFeedback.current?.key === key && now - lastFeedback.current.at < 750) return
    lastFeedback.current = { key, at: now }
    setFeedback({ ...next, id: ++sequence.current })
  }

  useEffect(() => {
    const onGlobalFeedback = (event: Event) => {
      const { kind, message } = (event as CustomEvent<GlobalFeedbackDetail>).detail
      if (message.trim()) showFeedback({ kind, message: message.trim() })
    }
    window.addEventListener(GLOBAL_FEEDBACK_EVENT, onGlobalFeedback)
    return () => window.removeEventListener(GLOBAL_FEEDBACK_EVENT, onGlobalFeedback)
  }, [])

  useEffect(() => {
    if (!feedback) return undefined
    addNotificationHistory(feedback.kind, feedback.message)
    const timeout = window.setTimeout(() => setFeedback(null), 3_000)
    return () => window.clearTimeout(timeout)
  }, [feedback])

  useEffect(() => {
    const messages = new WeakMap<HTMLElement, string>()
    const hiddenSources = new Set<HTMLElement>()

    const publish = (element: HTMLElement) => {
      if (element.closest('[data-cv-global-feedback="true"]')) return
      const message = messageText(element)
      if (!message || messages.get(element) === message) return
      messages.set(element, message)
      hiddenSources.add(element)
      element.hidden = true
      const sourceAction = element.querySelector<HTMLButtonElement>('button:not([disabled])')
      const nextFeedback: Omit<FeedbackMessage, 'id'> = {
        kind: isSuccess(element) ? 'success' : 'error',
        message,
        ...(sourceAction?.textContent?.trim() ? {
          actionLabel: sourceAction.textContent.trim(),
          action: () => sourceAction.click(),
        } : {}),
      }
      showFeedback(nextFeedback)
    }

    const scan = (root: ParentNode) => {
      if (root instanceof HTMLElement && root.matches(FEEDBACK_SELECTOR)) publish(root)
      root.querySelectorAll<HTMLElement>(FEEDBACK_SELECTOR).forEach(publish)
    }

    scan(document.body)
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'characterData') {
          const parent = mutation.target.parentElement?.closest<HTMLElement>(FEEDBACK_SELECTOR)
          if (parent) publish(parent)
          return
        }
        mutation.addedNodes.forEach((node) => {
          if (node instanceof HTMLElement) scan(node)
          else if (node.parentElement) {
            const parent = node.parentElement.closest<HTMLElement>(FEEDBACK_SELECTOR)
            if (parent) publish(parent)
          }
        })
      })
    })
    observer.observe(document.body, { childList: true, subtree: true, characterData: true })
    return () => {
      observer.disconnect()
      hiddenSources.forEach((element) => { if (element.isConnected) element.hidden = false })
    }
  }, [])

  if (!feedback) return null
  const Icon = feedback.kind === 'success' ? CircleCheck : CircleAlert
  return <aside key={feedback.id} className={`cv-global-feedback is-${feedback.kind}`} role={feedback.kind === 'error' ? 'alert' : 'status'} aria-live={feedback.kind === 'error' ? 'assertive' : 'polite'} data-cv-global-feedback="true">
    <Icon className="cv-global-feedback__icon" size={20} aria-hidden="true" />
    <p>{feedback.message}</p>
    {feedback.action && <button className="cv-global-feedback__action" type="button" onClick={() => { feedback.action?.(); setFeedback(null) }}>{feedback.actionLabel}</button>}
    <button className="cv-global-feedback__close" type="button" aria-label="Fermer le message" title="Fermer" onClick={() => setFeedback(null)}><X size={16} aria-hidden="true" /></button>
  </aside>
}
