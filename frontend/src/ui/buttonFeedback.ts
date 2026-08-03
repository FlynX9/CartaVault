import {
  API_MUTATION_FAILURE_EVENT,
  API_MUTATION_START_EVENT,
  API_MUTATION_SUCCESS_EVENT,
  type ApiMutationEventDetail,
} from '../api/mutationEvents'

const CLICK_FEEDBACK_CLASS = 'cv-button-click-feedback'
const SUCCESS_FEEDBACK_CLASS = 'cv-button-action-success'
const FILTER_SELECTOR = [
  '[class*="filter" i]',
  '[aria-label*="filtr" i]',
  '[aria-label*="filter" i]',
  '[title*="filtr" i]',
  '[title*="filter" i]',
  '[data-button-feedback="none"]',
].join(', ')

function mutationDetail(event: Event): ApiMutationEventDetail | null {
  return event instanceof CustomEvent ? event.detail as ApiMutationEventDetail : null
}

export function installButtonFeedback(root: Document = document): () => void {
  const view = root.defaultView ?? window
  const clickTimers = new Map<HTMLButtonElement, number>()
  const successTimers = new Map<HTMLButtonElement, number>()
  const settleTimers = new Map<HTMLButtonElement, number>()
  const requestButtons = new Map<string, HTMLButtonElement>()
  const buttonRequests = new Map<HTMLButtonElement, Set<string>>()
  const failedButtons = new Set<HTMLButtonElement>()
  let capturedButton: HTMLButtonElement | null = null
  let lastMutationButton: HTMLButtonElement | null = null
  let captureVersion = 0
  let liveRegion: HTMLSpanElement | null = null

  const eligibleButton = (target: EventTarget | null): HTMLButtonElement | null => {
    if (!(target instanceof Element)) return null
    const button = target.closest<HTMLButtonElement>('button')
    if (!button || button.disabled || button.matches(FILTER_SELECTOR) || button.closest(FILTER_SELECTOR)) return null
    return button
  }

  const capture = (button: HTMLButtonElement | null) => {
    if (!button) return
    capturedButton = button
    const version = ++captureVersion
    queueMicrotask(() => {
      if (captureVersion === version) capturedButton = null
    })
  }

  const triggerClickFeedback = (button: HTMLButtonElement) => {
    const previousTimer = clickTimers.get(button)
    if (previousTimer !== undefined) view.clearTimeout(previousTimer)
    button.classList.remove(CLICK_FEEDBACK_CLASS)
    void button.offsetWidth
    button.classList.add(CLICK_FEEDBACK_CLASS)
    clickTimers.set(button, view.setTimeout(() => {
      button.classList.remove(CLICK_FEEDBACK_CLASS)
      clickTimers.delete(button)
    }, 360))
  }

  const captureClick = (event: MouseEvent) => {
    const button = eligibleButton(event.target)
    capture(button)
    if (button) triggerClickFeedback(button)
  }

  const captureSubmit = (event: SubmitEvent) => {
    const submitter = event.submitter instanceof HTMLButtonElement
      ? event.submitter
      : event.target instanceof HTMLFormElement
        ? event.target.querySelector<HTMLButtonElement>('button[type="submit"]:not(:disabled)')
        : null
    capture(submitter && !submitter.matches(FILTER_SELECTOR) ? submitter : null)
  }

  const clearSuccess = (button: HTMLButtonElement) => {
    button.classList.remove(SUCCESS_FEEDBACK_CLASS)
    const timer = successTimers.get(button)
    if (timer !== undefined) view.clearTimeout(timer)
    successTimers.delete(button)
  }

  const showSuccess = (button: HTMLButtonElement) => {
    if (!button.isConnected) return
    clearSuccess(button)
    button.classList.remove(CLICK_FEEDBACK_CLASS)
    button.classList.add(SUCCESS_FEEDBACK_CLASS)
    liveRegion ??= (() => {
      const region = root.createElement('span')
      region.className = 'visually-hidden cv-button-feedback-live'
      region.setAttribute('aria-live', 'polite')
      root.body.append(region)
      return region
    })()
    liveRegion.textContent = ''
    view.requestAnimationFrame(() => { if (liveRegion) liveRegion.textContent = 'Action réussie' })
    successTimers.set(button, view.setTimeout(() => clearSuccess(button), 900))
  }

  const finishRequest = (detail: ApiMutationEventDetail, succeeded: boolean) => {
    const button = requestButtons.get(detail.id)
    if (!button) return
    requestButtons.delete(detail.id)
    const requests = buttonRequests.get(button)
    requests?.delete(detail.id)
    if (!succeeded) failedButtons.add(button)
    if (requests && requests.size > 0) return
    buttonRequests.delete(button)
    const previousSettle = settleTimers.get(button)
    if (previousSettle !== undefined) view.clearTimeout(previousSettle)
    if (failedButtons.delete(button)) {
      clearSuccess(button)
      if (lastMutationButton === button) lastMutationButton = null
      return
    }
    settleTimers.set(button, view.setTimeout(() => {
      settleTimers.delete(button)
      showSuccess(button)
      if (lastMutationButton === button) lastMutationButton = null
    }, 100))
  }

  const mutationStarted = (event: Event) => {
    const detail = mutationDetail(event)
    const button = capturedButton ?? (lastMutationButton?.isConnected ? lastMutationButton : null)
    if (!detail || !button) return
    const previousSettle = settleTimers.get(button)
    if (previousSettle !== undefined) {
      view.clearTimeout(previousSettle)
      settleTimers.delete(button)
    }
    clearSuccess(button)
    lastMutationButton = button
    requestButtons.set(detail.id, button)
    const requests = buttonRequests.get(button) ?? new Set<string>()
    requests.add(detail.id)
    buttonRequests.set(button, requests)
  }

  const mutationSucceeded = (event: Event) => {
    const detail = mutationDetail(event)
    if (detail) finishRequest(detail, true)
  }

  const mutationFailed = (event: Event) => {
    const detail = mutationDetail(event)
    if (detail) finishRequest(detail, false)
  }

  root.addEventListener('click', captureClick, true)
  root.addEventListener('submit', captureSubmit, true)
  view.addEventListener(API_MUTATION_START_EVENT, mutationStarted)
  view.addEventListener(API_MUTATION_SUCCESS_EVENT, mutationSucceeded)
  view.addEventListener(API_MUTATION_FAILURE_EVENT, mutationFailed)
  return () => {
    root.removeEventListener('click', captureClick, true)
    root.removeEventListener('submit', captureSubmit, true)
    view.removeEventListener(API_MUTATION_START_EVENT, mutationStarted)
    view.removeEventListener(API_MUTATION_SUCCESS_EVENT, mutationSucceeded)
    view.removeEventListener(API_MUTATION_FAILURE_EVENT, mutationFailed)
    clickTimers.forEach((timer) => view.clearTimeout(timer))
    successTimers.forEach((timer) => view.clearTimeout(timer))
    settleTimers.forEach((timer) => view.clearTimeout(timer))
    liveRegion?.remove()
  }
}
