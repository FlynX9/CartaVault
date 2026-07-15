import { createContext } from 'react'

export const WorkspacePanelCloseContext = createContext<(() => void) | null>(null)
