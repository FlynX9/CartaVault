import { useCallback, useEffect, useRef, useState } from 'react'

import { ConfirmDialog } from './ConfirmDialog'

interface ConfirmDialogOptions {
  title: string
  message: string
  confirmLabel?: string
}

export function useConfirmDialog() {
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
    setOptions(nextOptions)
  }), [])

  useEffect(() => () => resolverRef.current?.(false), [])

  return {
    confirm,
    confirmationDialog: options ? <ConfirmDialog {...options} onCancel={() => settle(false)} onConfirm={() => settle(true)} /> : null,
  }
}
