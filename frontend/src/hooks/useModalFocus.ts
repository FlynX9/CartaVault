import { type RefObject, useEffect } from 'react'

const FOCUSABLE_SELECTOR = [
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'a[href]',
  '[tabindex]:not([tabindex="-1"])',
].join(', ')

interface UseModalFocusOptions {
  dialogRef: RefObject<HTMLElement | null>
  initialFocusRef?: RefObject<HTMLElement | null>
  triggerRef?: RefObject<HTMLElement | null>
  onEscape?: () => void
}

/** Keeps keyboard focus inside a modal and restores it to its trigger on close. */
export function useModalFocus({ dialogRef, initialFocusRef, triggerRef, onEscape }: UseModalFocusOptions) {
  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return undefined

    const previousActiveElement = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const trigger = triggerRef?.current
    const focusInitialElement = () => {
      const firstFocusable = dialog.querySelector<HTMLElement>(FOCUSABLE_SELECTOR)
      ;(initialFocusRef?.current ?? firstFocusable)?.focus()
    }
    const frame = window.requestAnimationFrame(focusInitialElement)
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { onEscape?.(); return }
      if (event.key !== 'Tab') return
      const focusable = [...dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)]
      if (!focusable.length) return
      const first = focusable[0]
      const last = focusable.at(-1)!
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      window.cancelAnimationFrame(frame)
      document.removeEventListener('keydown', onKeyDown)
      ;(trigger ?? previousActiveElement)?.focus()
    }
  }, [dialogRef, initialFocusRef, onEscape, triggerRef])
}
