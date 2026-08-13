import { useCallback, useEffect, useRef, useState } from 'react'

import { ConfirmDialog } from './ConfirmDialog'

interface ConfirmDialogOptions {
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: 'danger' | 'positive'
  overlayClassName?: string
}

export function useConfirmDialog(defaults: Pick<ConfirmDialogOptions, 'overlayClassName'> = {}) {
  const defaultOverlayClassName = defaults.overlayClassName
  const [options, setOptions] = useState<ConfirmDialogOptions | null>(null)
  const resolverRef = useRef<((confirmed: boolean) => void) | null>(null)

  const settle = useCallback((confirmed: boolean) => {
    resolverRef.current?.(confirmed)
    resolverRef.current = null
    setOptions(null)
  }, [])

  const confirm = useCallback((nextOptions: ConfirmDialogOptions) => new Promise<boolean>((resolve) => {
    resolverRef.current?.(false)
    resolverRef.current = resolve
    setOptions({ ...nextOptions, overlayClassName: nextOptions.overlayClassName ?? defaultOverlayClassName })
  }), [defaultOverlayClassName])

  useEffect(() => () => resolverRef.current?.(false), [])
  useEffect(() => {
    const closeFromMobileNavigation = () => settle(false)
    window.addEventListener('cartavault:close-mobile-modal-layers', closeFromMobileNavigation)
    return () => window.removeEventListener('cartavault:close-mobile-modal-layers', closeFromMobileNavigation)
  }, [settle])

  return {
    confirm,
    confirmationDialog: options ? <ConfirmDialog {...options} onCancel={() => settle(false)} onConfirm={() => settle(true)} /> : null,
  }
}
