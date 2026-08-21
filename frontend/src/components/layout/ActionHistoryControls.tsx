import { useEffect } from 'react'
import { Redo2, Undo2 } from 'lucide-react'

import { redoLastAction, undoLastAction, useActionHistory } from '../../ui/actionHistory'

export function ActionHistoryKeyboardShortcuts() {
  useEffect(() => {
    const navigateHistory = (event: KeyboardEvent) => {
      const key = event.key.toLocaleLowerCase()
      const isUndo = key === 'z' && !event.shiftKey
      const isRedo = key === 'y' || key === 'z' && event.shiftKey
      if (!(event.ctrlKey || event.metaKey) || event.altKey || (!isUndo && !isRedo)) return
      const target = event.target
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || (target instanceof HTMLElement && target.isContentEditable)) return
      event.preventDefault()
      void (isRedo ? redoLastAction() : undoLastAction())
    }
    window.addEventListener('keydown', navigateHistory)
    return () => window.removeEventListener('keydown', navigateHistory)
  }, [])
  return null
}

export function ActionHistoryControls({ menu = false }: { menu?: boolean }) {
  const history = useActionHistory()

  return <div className={`action-history-controls${menu ? ' action-history-controls--menu' : ''}`} aria-label="Historique des actions">
    <button className={menu ? undefined : 'panel-icon-button'} type="button" role={menu ? 'menuitem' : undefined} disabled={history.busy || history.undoLabel === null} aria-label={history.undoLabel ? `Annuler : ${history.undoLabel}` : 'Aucune action à annuler'} title={history.undoLabel ? `Annuler : ${history.undoLabel} (Ctrl+Z)` : 'Aucune action à annuler'} onClick={() => void undoLastAction()}><Undo2 size={menu ? 17 : 18} aria-hidden="true" />{menu && <span>Annuler</span>}</button>
    <button className={menu ? undefined : 'panel-icon-button'} type="button" role={menu ? 'menuitem' : undefined} disabled={history.busy || history.redoLabel === null} aria-label={history.redoLabel ? `Rétablir : ${history.redoLabel}` : 'Aucune action à rétablir'} title={history.redoLabel ? `Rétablir : ${history.redoLabel} (Ctrl+Y)` : 'Aucune action à rétablir'} onClick={() => void redoLastAction()}><Redo2 size={menu ? 17 : 18} aria-hidden="true" />{menu && <span>Rétablir</span>}</button>
    {history.error && <span className="action-history-error" role="alert">{history.error}</span>}
  </div>
}
