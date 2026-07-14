import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { createPortal } from 'react-dom'

import {
  CATEGORY_ICON_GROUPS,
  DEFAULT_CATEGORY_ICON_ID,
  GROUP_LABELS,
  searchCategoryIcons,
  type CategoryIconGroup,
} from '../../icons/categoryIconCatalog'
import { getResolvedCategoryIconId } from '../../icons/categoryIconData'
import { CategoryIconGrid } from './CategoryIconGrid'
import { CategoryIconPreview } from './CategoryIconPreview'

interface CategoryIconPickerProps {
  initialIconId: string | null | undefined
  onCancel: () => void
  onChoose: (iconId: string) => void
}

function focusableElements(container: HTMLElement): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled])')]
}

export function CategoryIconPicker({ initialIconId, onCancel, onChoose }: CategoryIconPickerProps) {
  const [query, setQuery] = useState('')
  const [group, setGroup] = useState<CategoryIconGroup | undefined>()
  const [selectedIconId, setSelectedIconId] = useState(getResolvedCategoryIconId(initialIconId ?? DEFAULT_CATEGORY_ICON_ID))
  const searchInput = useRef<HTMLInputElement>(null)
  const dialog = useRef<HTMLDivElement>(null)
  const visibleIcons = useMemo(() => searchCategoryIcons(query, group), [query, group])

  useEffect(() => {
    searchInput.current?.focus()
  }, [])

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [onCancel])

  const trapFocus = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Tab' || !dialog.current) return
    const elements = focusableElements(dialog.current)
    const first = elements[0]
    const last = elements.at(-1)
    if (!first || !last) return
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  return createPortal(
    <div className="category-icon-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel() }}>
      <div className="category-icon-modal" ref={dialog} role="dialog" aria-modal="true" aria-labelledby="category-icon-picker-title" onKeyDown={trapFocus}>
        <header>
          <div>
            <p className="details-kicker">Catégorie</p>
            <h2 id="category-icon-picker-title">Choisir une icône</h2>
          </div>
          <button className="icon-modal-close" type="button" onClick={onCancel} aria-label="Fermer le sélecteur d’icônes">×</button>
        </header>

        <label className="form-field">
          <span>Rechercher une icône</span>
          <input ref={searchInput} type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Église, hôpital, poste frontière…" />
        </label>

        <div className="category-icon-groups" role="group" aria-label="Groupes d’icônes">
          <button className={!group ? 'selected' : ''} type="button" aria-pressed={!group} onClick={() => setGroup(undefined)}>Toutes</button>
          {CATEGORY_ICON_GROUPS.map((iconGroup) => <button className={group === iconGroup ? 'selected' : ''} type="button" aria-pressed={group === iconGroup} key={iconGroup} onClick={() => setGroup(iconGroup)}>{GROUP_LABELS[iconGroup]}</button>)}
        </div>

        <p className="category-icon-selection" aria-live="polite"><CategoryIconPreview iconId={selectedIconId} /> <span>{visibleIcons.length} icône{visibleIcons.length > 1 ? 's' : ''} disponible{visibleIcons.length > 1 ? 's' : ''}</span></p>
        {visibleIcons.length === 0 ? <p className="category-icon-empty">Aucune icône ne correspond à cette recherche.</p> : <CategoryIconGrid icons={visibleIcons} selectedIconId={selectedIconId} onSelect={setSelectedIconId} />}

        <footer>
          <button className="secondary-button" type="button" onClick={onCancel}>Annuler</button>
          <button className="primary-button" type="button" onClick={() => onChoose(selectedIconId)}>Choisir</button>
        </footer>
      </div>
    </div>,
    document.body,
  )
}
