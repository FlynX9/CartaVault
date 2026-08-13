import { useEffect, useRef, useState, type DragEvent, type FormEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { IconPackageImport } from '@tabler/icons-react'
import { GripVertical, MapPin, Pencil, Plus, Trash2 } from 'lucide-react'

import { createStatus, deleteStatus, getStatuses, reorderStatuses, updateStatus } from '../../api/statuses'
import { WorkspaceSearchField } from '../../components/admin/WorkspaceSearchField'
import { ProfileImportDialog } from '../../components/admin/ProfileImportDialog'
import { FieldHelp } from '../../components/common/FieldHelp'
import { publishGlobalFeedback } from '../../components/common/globalFeedback'
import { useConfirmDialog } from '../../components/common/useConfirmDialog'
import { WorkspacePanelHeader } from '../../components/layout/WorkspacePanelHeader'
import type { PlaceStatus } from '../../types/status'

interface StatusFormState {
  name: string
  color: string
  is_active: boolean
  is_default: boolean
  functional_state: 'non_visited' | 'visited'
}

const EMPTY_FORM: StatusFormState = {
  name: '',
  color: '#2563EB',
  is_active: true,
  is_default: false,
  functional_state: 'non_visited',
}

function formatAssociatedPlaces(count: number) {
  return `${count} ${count === 1 ? 'POI associé' : 'POI associés'}`
}

interface StatusesPanelProps {
  variant?: 'page' | 'panel'
  mapId?: string
  canEdit?: boolean
}

export function StatusesPanel({ variant = 'page', mapId, canEdit = true }: StatusesPanelProps) {
  const { confirm, confirmationDialog } = useConfirmDialog()
  const [statuses, setStatuses] = useState<PlaceStatus[]>([])
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<PlaceStatus | null>(null)
  const [form, setForm] = useState<StatusFormState>(EMPTY_FORM)
  const [error, setError] = useState<string | null>(null)
  const [refresh, setRefresh] = useState(0)
  const [showForm, setShowForm] = useState(variant === 'page')
  const [draggedStatusId, setDraggedStatusId] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<{ id: string; position: 'before' | 'after' } | null>(null)
  const swipeStart = useRef<{ id: string; pointerId: number; x: number } | null>(null)
  const [swipe, setSwipe] = useState<{ id: string; offset: number } | null>(null)
  const [revealed, setRevealed] = useState<{ id: string; direction: 'delete' | 'edit' } | null>(null)
  const [showProfileImport, setShowProfileImport] = useState(false)
  const [success, setSuccess] = useState<string | null>(null)

  useEffect(() => {
    if (!mapId) {
      setStatuses([])
      return
    }
    const controller = new AbortController()
    void getStatuses(mapId, controller.signal, { q: search || undefined })
      .then(setStatuses)
      .catch((caught: unknown) => {
        if (!(caught instanceof Error && caught.name === 'AbortError')) {
          setError(caught instanceof Error ? caught.message : 'Chargement impossible.')
        }
      })
    return () => controller.abort()
  }, [mapId, search, refresh])

  const select = (item: PlaceStatus) => {
    setEditing(item)
    setForm({
      name: item.name,
      color: item.color,
      is_active: item.is_active,
      is_default: item.is_default,
      functional_state: item.functional_state,
    })
    setError(null)
    setShowForm(true)
  }

  const reset = () => {
    setEditing(null)
    setForm(EMPTY_FORM)
    setError(null)
    setShowForm(variant === 'page')
  }
  const startSwipe = (event: ReactPointerEvent<HTMLLIElement>, statusId: string) => {
    if (!isPanel || event.pointerType === 'mouse' || (event.target as HTMLElement).closest('button')) return
    event.currentTarget.setPointerCapture?.(event.pointerId)
    swipeStart.current = { id: statusId, pointerId: event.pointerId, x: event.clientX }
    const offset = revealed?.id === statusId ? revealed.direction === 'delete' ? 86 : -70 : 0
    setSwipe({ id: statusId, offset })
    if (revealed?.id !== statusId) setRevealed(null)
  }
  const moveSwipe = (event: ReactPointerEvent<HTMLLIElement>) => {
    const current = swipeStart.current
    if (!current || current.pointerId !== event.pointerId) return
    const base = revealed?.id === current.id ? revealed.direction === 'delete' ? 86 : -70 : 0
    const offset = Math.max(-78, Math.min(94, event.clientX - current.x + base))
    if (Math.abs(offset) > 6) event.preventDefault()
    setSwipe({ id: current.id, offset })
  }
  const endSwipe = (event: ReactPointerEvent<HTMLLIElement>) => {
    const current = swipeStart.current
    if (!current || current.pointerId !== event.pointerId) return
    const offset = swipe?.id === current.id ? swipe.offset : 0
    swipeStart.current = null
    setSwipe(null)
    setRevealed(Math.abs(offset) >= 38 ? { id: current.id, direction: offset > 0 ? 'delete' : 'edit' } : null)
  }

  const create = () => {
    setEditing(null)
    setForm(EMPTY_FORM)
    setError(null)
    setShowForm(true)
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!mapId || !canEdit) return
    setError(null)
    const payload = {
      map_id: mapId,
      name: form.name.trim(),
      color: form.color.toUpperCase(),
      is_active: form.is_active,
      is_default: form.is_default,
      functional_state: form.functional_state,
    }
    if (
      editing
      && editing.places_count > 0
      && editing.functional_state !== form.functional_state
      && !await confirm({
        title: 'Modifier l’état de visite ?',
        message: `Passer ce statut de « ${editing.functional_state === 'visited' ? 'Visité' : 'Non visité'} » à « ${form.functional_state === 'visited' ? 'Visité' : 'Non visité'} » modifiera le classement fonctionnel de ${editing.places_count} lieu${editing.places_count > 1 ? 'x' : ''}.`,
        confirmLabel: 'Confirmer la modification',
      })
    ) return

    try {
      const editedName = editing?.name
      if (editing) {
        const { map_id: _mapId, ...updatePayload } = payload
        await updateStatus(editing.id, updatePayload)
      } else {
        await createStatus(payload)
      }
      publishGlobalFeedback('success', `Statut « ${payload.name} » ${editedName ? 'modifié' : 'créé'}.`)
      reset()
      setRefresh((value) => value + 1)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Enregistrement impossible.')
    }
  }

  const remove = async (item: PlaceStatus) => {
    if (!await confirm({ title: 'Supprimer ce statut ?', message: `Le statut « ${item.name} » sera définitivement supprimé.` })) return
    try {
      await deleteStatus(item.id)
      publishGlobalFeedback('success', `Statut « ${item.name} » supprimé.`)
      if (editing?.id === item.id) reset()
      setRefresh((value) => value + 1)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Suppression impossible.')
    }
  }

  const reorder = async (event: DragEvent<HTMLLIElement>, targetId: string) => {
    event.preventDefault()
    if (!mapId || !canEdit || search || !draggedStatusId || draggedStatusId === targetId) return

    const current = statuses
    const sourceIndex = current.findIndex((item) => item.id === draggedStatusId)
    const targetIndex = current.findIndex((item) => item.id === targetId)
    if (sourceIndex < 0 || targetIndex < 0) return

    const next = [...current]
    const [moved] = next.splice(sourceIndex, 1)
    const position = dropTarget?.id === targetId ? dropTarget.position : 'after'
    const insertionIndex = targetIndex - Number(sourceIndex < targetIndex) + Number(position === 'after')
    next.splice(insertionIndex, 0, moved)
    setStatuses(next)
    setDraggedStatusId(null)
    setDropTarget(null)

    try {
      setStatuses(await reorderStatuses(mapId, next.map((item) => item.id)))
    } catch (caught) {
      setStatuses(current)
      setError(caught instanceof Error ? caught.message : 'Réorganisation impossible.')
    }
  }

  const isPanel = variant === 'panel'
  const panelHeader = (
    <WorkspacePanelHeader
      eyebrow="Organisation"
      title="Statuts"
      count={`${statuses.length} élément${statuses.length > 1 ? 's' : ''}`}
      action={canEdit ? (<div className="cv-workspace-panel__resource-actions">
        {mapId && <button className="panel-icon-button panel-import-action" type="button" aria-label="Importer des statuts depuis un profil" title="Importer depuis un profil" onClick={() => setShowProfileImport(true)}><IconPackageImport size={18} stroke={1.8} aria-hidden="true" /></button>}
        <button className="panel-icon-button primary panel-create-action" type="button" aria-label="Créer un statut" title="Nouveau statut" onClick={create}>
          <Plus size={18} aria-hidden="true" />
          <span className="panel-create-action__label">Nouveau statut</span>
        </button></div>
      ) : undefined}
    />
  )

  return (
    <section className={`admin-page${isPanel ? ' cv-management-panel cv-statuses-panel' : ''}`}>
      {isPanel ? panelHeader : (
        <header className="admin-page-header">
          <div><h2>Statuts de suivi</h2></div>
          {canEdit && <button className="primary-button" type="button" onClick={create}>Nouveau statut</button>}
        </header>
      )}
      {isPanel ? (
        <WorkspaceSearchField value={search} placeholder="Rechercher un statut" onChange={setSearch} />
      ) : (
        <label className="admin-search"><span>Rechercher par nom ou slug</span><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
      )}
      {error && <p className="form-alert" role="alert">{error}</p>}
      {success && <p className="admin-success" role="status">{success}</p>}
      {showProfileImport && mapId && <ProfileImportDialog mapId={mapId} resourceType="statuses" onClose={() => setShowProfileImport(false)} onImported={(message) => { setSuccess(message); setRefresh((value) => value + 1) }} />}
      {showForm && canEdit && (
        <form className={`admin-form${isPanel ? ' cv-workspace-panel__form' : ''}`} onSubmit={(event) => void submit(event)}>
          <h3>{editing ? `Modifier ${editing.name}` : 'Créer un statut'}</h3>
          <div className="status-form-grid">
            <label className="form-field status-form-name"><span>Nom *</span><input required maxLength={100} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
            <fieldset className="form-field status-functional-state">
              <legend>État de visite *<FieldHelp>Cet état permet à CartaVault de regrouper les lieux dans les filtres « Visités » et « Non visités ». Il reste indépendant du nom du statut.</FieldHelp></legend>
              <div className="status-functional-options">
                <label><input type="radio" name="functional-state" value="non_visited" checked={form.functional_state === 'non_visited'} onChange={() => setForm({ ...form, functional_state: 'non_visited' })} /> Non visité</label>
                <label><input type="radio" name="functional-state" value="visited" checked={form.functional_state === 'visited'} onChange={() => setForm({ ...form, functional_state: 'visited' })} /> Visité</label>
              </div>
            </fieldset>
            <fieldset className="form-field status-settings">
              <legend>Paramètres du statut</legend>
              <div className="status-settings-fields">
                <label className="form-field status-color-field">
                  <span>Couleur</span>
                  <span className="cv-status-color-swatch" style={{ backgroundColor: form.color }}>
                    <input className="cv-status-color-input" aria-label="Couleur" type="color" value={form.color} onChange={(event) => setForm({ ...form, color: event.target.value.toUpperCase() })} />
                  </span>
                </label>
              </div>
              <div className="status-checkbox-help">
                <div className="status-checkbox-help__label"><label className="checkbox-field"><input type="checkbox" checked={form.is_active} onChange={(event) => setForm({ ...form, is_active: event.target.checked })} /><strong>Actif</strong></label><FieldHelp>Un statut inactif reste associé aux lieux existants, mais ne peut plus être choisi pour de nouveaux lieux.</FieldHelp></div>
              </div>
              <div className="status-checkbox-help">
                <div className="status-checkbox-help__label"><label className="checkbox-field"><input type="checkbox" checked={form.is_default} onChange={(event) => setForm({ ...form, is_default: event.target.checked })} /><strong>Statut par défaut</strong></label><FieldHelp>Ce statut est automatiquement proposé lors de la création d’un nouveau lieu.</FieldHelp></div>
              </div>
            </fieldset>
          </div>
          <div className="admin-form-actions"><button className="primary-button" data-cv-save="true" type="submit">Enregistrer</button>{(editing || isPanel) && <button className="secondary-button" type="button" onClick={reset}>Annuler</button>}</div>
        </form>
      )}
      <ul className={`admin-entity-list${isPanel ? ' cv-panel-status-list cv-workspace-panel__list' : ''}`}>
        {statuses.map((item) => (
          <li
            className={`${isPanel ? 'cv-workspace-panel__card cv-mobile-swipe-entity' : ''}${draggedStatusId === item.id ? ' is-dragging' : ''}${dropTarget?.id === item.id ? ` is-drop-${dropTarget.position}` : ''}`}
            key={item.id}
            draggable={canEdit && !search}
            onDragStart={(event) => { event.dataTransfer.effectAllowed = 'move'; setDraggedStatusId(item.id) }}
            onDragOver={(event) => { if (canEdit && !search && draggedStatusId !== item.id) { event.preventDefault(); const bounds = event.currentTarget.getBoundingClientRect(); setDropTarget({ id: item.id, position: event.clientY < bounds.top + bounds.height / 2 ? 'before' : 'after' }) } }}
            onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropTarget((current) => current?.id === item.id ? null : current) }}
            onDrop={(event) => void reorder(event, item.id)}
            onDragEnd={() => { setDraggedStatusId(null); setDropTarget(null) }}
            onPointerDown={(event) => startSwipe(event, item.id)}
            onPointerMove={moveSwipe}
            onPointerUp={endSwipe}
            onPointerCancel={() => { swipeStart.current = null; setSwipe(null) }}
          >
            {isPanel && canEdit && !item.is_default && item.places_count === 0 && <button className="cv-mobile-swipe-entity__delete" type="button" aria-hidden={!(revealed?.id === item.id && revealed.direction === 'delete')} tabIndex={revealed?.id === item.id && revealed.direction === 'delete' ? 0 : -1} aria-label={`Supprimer ${item.name}`} onClick={() => void remove(item)}><Trash2 size={17} /></button>}
            {isPanel && canEdit && <button className="cv-mobile-swipe-entity__edit" type="button" aria-hidden={!(revealed?.id === item.id && revealed.direction === 'edit')} tabIndex={revealed?.id === item.id && revealed.direction === 'edit' ? 0 : -1} aria-label={`Modifier ${item.name}`} onClick={() => select(item)}><Pencil size={17} /></button>}
            <div className="cv-mobile-swipe-entity__row" style={isPanel ? { transform: `translateX(${swipe?.id === item.id ? swipe.offset : revealed?.id === item.id ? revealed.direction === 'delete' ? 86 : -70 : 0}px)` } : undefined}>
            {canEdit && !search && <GripVertical className="status-drag-handle" size={16} aria-hidden="true" />}
            <div className="status-summary"><span className="status-dot" style={{ backgroundColor: item.color }} /><div><strong>{item.name}</strong>{isPanel ? <span className="status-row-state-text">{item.functional_state === 'visited' ? 'Visité' : 'Non visité'}</span> : <p>{item.functional_state === 'visited' ? 'Visité' : 'Non visité'} · {item.slug} · <span className="status-place-count" aria-label={formatAssociatedPlaces(item.places_count)}>{item.places_count} POI</span></p>}</div></div>
            {isPanel && <div className="status-row-labels">{item.is_default && <b className="account-integration-state is-neutral">Défaut</b>}<span className="status-place-count account-integration-state is-neutral" aria-label={formatAssociatedPlaces(item.places_count)}><MapPin aria-hidden="true" />{item.places_count} POI</span>{!item.is_active && <b>Inactif</b>}</div>}
            {canEdit && <div className="entity-actions">{isPanel ? <><button className="panel-icon-button" type="button" aria-label={`Modifier ${item.name}`} title={`Modifier ${item.name}`} onClick={() => select(item)}><Pencil size={16} /></button><button className="panel-icon-button danger" type="button" aria-label={`Supprimer ${item.name}`} title={`Supprimer ${item.name}`} disabled={item.is_default || item.places_count > 0} onClick={() => void remove(item)}><Trash2 size={16} /></button></> : <><button className="secondary-button" type="button" onClick={() => select(item)}>Modifier</button><button className="danger-button" type="button" disabled={item.is_default || item.places_count > 0} onClick={() => void remove(item)}>Supprimer</button></>}</div>}
            </div>
          </li>
        ))}
      </ul>
      {confirmationDialog}
    </section>
  )
}

export function StatusesPage() {
  return <StatusesPanel />
}
