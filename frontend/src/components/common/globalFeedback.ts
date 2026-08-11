export type GlobalFeedbackKind = 'error' | 'success'

export interface GlobalFeedbackDetail {
  kind: GlobalFeedbackKind
  message: string
}

export const GLOBAL_FEEDBACK_EVENT = 'cartavault:global-feedback'

export function publishGlobalFeedback(kind: GlobalFeedbackKind, message: string) {
  window.dispatchEvent(new CustomEvent<GlobalFeedbackDetail>(GLOBAL_FEEDBACK_EVENT, {
    detail: { kind, message },
  }))
}
