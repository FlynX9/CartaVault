const FEEDBACK_CLASS = 'cv-button-click-feedback'
const FILTER_SELECTOR = [
  '[class*="filter" i]',
  '[aria-label*="filtr" i]',
  '[aria-label*="filter" i]',
  '[title*="filtr" i]',
  '[title*="filter" i]',
  '[data-button-feedback="none"]',
].join(', ')

export function installButtonFeedback(root: Document = document): () => void {
  const removalTimers = new WeakMap<HTMLButtonElement, number>()

  const trigger = (event: MouseEvent) => {
    if (!(event.target instanceof Element)) return
    const button = event.target.closest<HTMLButtonElement>('button')
    if (!button || button.disabled || button.matches(FILTER_SELECTOR) || button.closest(FILTER_SELECTOR)) return

    const previousTimer = removalTimers.get(button)
    if (previousTimer !== undefined) window.clearTimeout(previousTimer)
    button.classList.remove(FEEDBACK_CLASS)
    void button.offsetWidth
    button.classList.add(FEEDBACK_CLASS)
    removalTimers.set(button, window.setTimeout(() => {
      button.classList.remove(FEEDBACK_CLASS)
      removalTimers.delete(button)
    }, 360))
  }

  root.addEventListener('click', trigger)
  return () => root.removeEventListener('click', trigger)
}
