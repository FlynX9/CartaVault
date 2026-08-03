import { useSyncExternalStore } from 'react'

export interface ReversibleAction {
  label: string
  undo: () => Promise<void>
  redo: () => Promise<void>
}

interface ActionHistorySnapshot {
  undoLabel: string | null
  redoLabel: string | null
  busy: boolean
  error: string | null
}

const MAX_HISTORY_LENGTH = 50
export const WORKSPACE_CHANGED_EVENT = 'cartavault:workspace-changed'
const undoStack: ReversibleAction[] = []
const redoStack: ReversibleAction[] = []
const listeners = new Set<() => void>()
let busy = false
let error: string | null = null
let snapshot: ActionHistorySnapshot = { undoLabel: null, redoLabel: null, busy: false, error: null }

function publish(): void {
  snapshot = {
    undoLabel: undoStack.at(-1)?.label ?? null,
    redoLabel: redoStack.at(-1)?.label ?? null,
    busy,
    error,
  }
  listeners.forEach((listener) => listener())
}

export function recordReversibleAction(action: ReversibleAction): void {
  undoStack.push(action)
  if (undoStack.length > MAX_HISTORY_LENGTH) undoStack.shift()
  redoStack.length = 0
  error = null
  publish()
}

export function announceWorkspaceChanged(): void {
  window.dispatchEvent(new Event(WORKSPACE_CHANGED_EVENT))
}

async function execute(source: ReversibleAction[], target: ReversibleAction[], operation: 'undo' | 'redo'): Promise<boolean> {
  if (busy) return false
  const action = source.at(-1)
  if (!action) return false
  busy = true
  error = null
  publish()
  try {
    await action[operation]()
    source.pop()
    target.push(action)
    return true
  } catch (caught) {
    error = caught instanceof Error ? caught.message : 'Impossible de restaurer cette action.'
    return false
  } finally {
    busy = false
    publish()
  }
}

export function undoLastAction(): Promise<boolean> {
  return execute(undoStack, redoStack, 'undo')
}

export function redoLastAction(): Promise<boolean> {
  return execute(redoStack, undoStack, 'redo')
}

export function clearActionHistory(): void {
  undoStack.length = 0
  redoStack.length = 0
  busy = false
  error = null
  publish()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useActionHistory(): ActionHistorySnapshot {
  return useSyncExternalStore(subscribe, () => snapshot, () => snapshot)
}
