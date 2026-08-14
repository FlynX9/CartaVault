import { createContext, useContext, useEffect } from 'react'

export type AdminSaveEntry = {
  label: string
  dirty: boolean
  busy: boolean
  save: () => Promise<void>
  discard: () => void
}

export type AdminSaveContextValue = {
  register: (id: string, entry: AdminSaveEntry) => void
  unregister: (id: string) => void
}

export const AdminSaveContext = createContext<AdminSaveContextValue | null>(null)

export function useAdminSaveEntry(id: string, entry: AdminSaveEntry) {
  const context = useContext(AdminSaveContext)
  useEffect(() => {
    context?.register(id, entry)
    return () => context?.unregister(id)
  }, [context, entry, id])
}
