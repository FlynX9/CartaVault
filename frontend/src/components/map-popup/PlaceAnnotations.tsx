import { useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronDown, Eye, EyeOff, MapPinned, Pencil, Plus, Save, Trash2, X } from 'lucide-react'

import { deletePlaceAnnotation, getAnnotationTemplates, getPlaceAnnotations, updatePlaceAnnotation } from '../../api/annotations'
import type { AnnotationTemplate, PlaceAnnotation } from '../../types/annotation'
import { CategoryIconPreview } from '../icons/CategoryIconPreview'

export function PlaceAnnotations({ placeId, mapId, canEdit, onChanged }: { placeId: string; mapId: string; canEdit: boolean; onChanged?: (annotations: PlaceAnnotation[]) => void }) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [templates, setTemplates] = useState<AnnotationTemplate[]>([])
  const [annotations, setAnnotations] = useState<PlaceAnnotation[]>([])
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(() => new Set())
  const [templateId, setTemplateId] = useState('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [editingAnnotationId, setEditingAnnotationId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const activeTemplates = useMemo(() => templates.filter((item) => item.is_active), [templates])
  const selectedTemplate = activeTemplates.find((item) => item.id === templateId) ?? null
  const editingAnnotation = annotations.find((item) => item.id === editingAnnotationId) ?? null
  const formTemplate = editingAnnotation?.template ?? selectedTemplate

  const refreshAnnotations = useCallback(() => {
    void getPlaceAnnotations(placeId).then((nextAnnotations) => {
      setAnnotations(nextAnnotations)
      onChanged?.(nextAnnotations)
    }).catch((caught: unknown) => setError(caught instanceof Error ? caught.message : 'Impossible de charger les annotations.'))
  }, [onChanged, placeId])

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError(null)
    setHiddenIds(new Set())
    Promise.all([getAnnotationTemplates(mapId, controller.signal), getPlaceAnnotations(placeId, controller.signal)]).then(([nextTemplates, nextAnnotations]) => {
      setTemplates(nextTemplates)
      setAnnotations(nextAnnotations)
      onChanged?.(nextAnnotations)
      const first = nextTemplates.find((item) => item.is_active)
      if (first) setTemplateId((current) => current || first.id)
    }).catch((caught: unknown) => {
      if (!(caught instanceof Error && caught.name === 'AbortError')) setError(caught instanceof Error ? caught.message : 'Impossible de charger les annotations.')
    }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [mapId, onChanged, placeId])

  useEffect(() => {
    const refresh = (event: Event) => {
      const detail = (event as CustomEvent<{ placeId?: string; source?: string }>).detail
      if (detail?.placeId === placeId && detail.source !== 'popup-annotations') refreshAnnotations()
    }
    window.addEventListener('cartavault:annotations-updated', refresh)
    return () => window.removeEventListener('cartavault:annotations-updated', refresh)
  }, [placeId, refreshAnnotations])

  useEffect(() => {
    const select = (event: Event) => {
      const detail = (event as CustomEvent<{ placeId?: string; annotationId?: string }>).detail
      if (detail?.placeId !== placeId || !detail.annotationId) return
      setSelectedAnnotationId(detail.annotationId)
      setOpen(true)
    }
    window.addEventListener('cartavault:annotation-selected', select)
    return () => window.removeEventListener('cartavault:annotation-selected', select)
  }, [placeId])

  const resetForm = () => { setAdding(false); setEditingAnnotationId(null); setTitle(''); setDescription('') }
  const startAdding = () => { setEditingAnnotationId(null); setTitle(''); setDescription(''); setAdding(true) }
  const startEditing = (annotation: PlaceAnnotation) => { setAdding(false); setEditingAnnotationId(annotation.id); setTitle(annotation.title ?? ''); setDescription(annotation.description ?? '') }
  const toggleVisibility = (annotationId: string) => {
    const visible = hiddenIds.has(annotationId)
    setHiddenIds((current) => { const next = new Set(current); if (visible) next.delete(annotationId); else next.add(annotationId); return next })
    window.dispatchEvent(new CustomEvent('cartavault:annotation-visibility-changed', { detail: { annotationId, visible } }))
  }
  const allVisible = annotations.length > 0 && annotations.every((annotation) => !hiddenIds.has(annotation.id))
  const toggleAllVisibility = () => {
    const visible = !allVisible
    setHiddenIds(visible ? new Set() : new Set(annotations.map((annotation) => annotation.id)))
    window.dispatchEvent(new CustomEvent('cartavault:place-annotations-visibility-changed', { detail: { placeId, annotationIds: annotations.map((annotation) => annotation.id), visible } }))
  }
  const remove = async (id: string) => {
    try {
      await deletePlaceAnnotation(placeId, id)
      const next = annotations.filter((item) => item.id !== id)
      setAnnotations(next)
      onChanged?.(next)
      window.dispatchEvent(new CustomEvent('cartavault:annotations-updated', { detail: { placeId, source: 'popup-annotations' } }))
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Suppression impossible.') }
  }
  const startDrawing = () => {
    if (!selectedTemplate) return
    window.dispatchEvent(new CustomEvent('cartavault:annotation-draw-requested', { detail: { placeId, template: selectedTemplate, title: title.trim() || null, description: description.trim() || null } }))
    resetForm()
  }
  const saveEdit = async () => {
    if (!editingAnnotation) return
    setSaving(true)
    try {
      const updated = await updatePlaceAnnotation(placeId, editingAnnotation.id, { title: title.trim() || null, description: description.trim() || null })
      const next = annotations.map((item) => item.id === updated.id ? updated : item)
      setAnnotations(next)
      onChanged?.(next)
      resetForm()
      window.dispatchEvent(new CustomEvent('cartavault:annotations-updated', { detail: { placeId, source: 'popup-annotations' } }))
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Impossible de modifier l’annotation.') } finally { setSaving(false) }
  }
  const selectAnnotation = (annotationId: string) => {
    setSelectedAnnotationId(annotationId)
    window.dispatchEvent(new CustomEvent('cartavault:annotation-selected', { detail: { placeId, annotationId } }))
  }
  const hoverAnnotation = (annotationId: string | null) => {
    window.dispatchEvent(new CustomEvent('cartavault:annotation-hover-changed', { detail: { placeId, annotationId } }))
  }

  return <section className="popup-annotations">
    <header className="popup-annotations__header"><button type="button" className="popup-annotations__toggle" aria-expanded={open} onClick={() => setOpen((value) => !value)}><MapPinned size={16} /><span>Plan / annotations</span><b>{loading ? '…' : annotations.length}</b><ChevronDown size={16} /></button>{annotations.length > 0 && <button type="button" className="popup-annotations__toggle-all" aria-label={allVisible ? 'Masquer toutes les annotations' : 'Afficher toutes les annotations'} title={allVisible ? 'Masquer toutes les annotations' : 'Afficher toutes les annotations'} onClick={toggleAllVisibility}>{allVisible ? <Eye size={16} /> : <EyeOff size={16} />}</button>}</header>
    {open && <div className="popup-annotations__body">
      {loading ? <p>Chargement…</p> : <>
        {annotations.length > 0 ? <ul>{annotations.map((item) => {
          const visible = !hiddenIds.has(item.id)
          return <li className={selectedAnnotationId === item.id ? 'is-selected' : undefined} key={item.id} aria-selected={selectedAnnotationId === item.id} onClick={() => selectAnnotation(item.id)} onMouseEnter={() => hoverAnnotation(item.id)} onMouseLeave={() => hoverAnnotation(null)}>
            <button className="popup-annotations__visibility" type="button" aria-label={`${visible ? 'Masquer' : 'Afficher'} l’annotation ${item.title || item.template.name}`} title={visible ? 'Masquer sur la carte' : 'Afficher sur la carte'} aria-pressed={visible} onClick={() => toggleVisibility(item.id)}>{visible ? <Eye size={15} /> : <EyeOff size={15} />}</button>
            <span className="popup-annotations__icon" style={{ color: item.template.color }}><CategoryIconPreview iconId={item.template.icon} size={17} showLabel={false} /></span>
            <div className="popup-annotations__copy"><span>{item.title || item.template.name}</span>{item.description && <small>{item.description}</small>}</div>
            {canEdit && <div className="popup-annotations__actions"><button type="button" className="popup-annotations__title-action" aria-label="Modifier l’annotation" title="Modifier" onClick={() => startEditing(item)}><Pencil size={14} /></button><button type="button" aria-label="Supprimer l’annotation" title="Supprimer" onClick={() => void remove(item.id)}><Trash2 size={14} /></button></div>}
          </li>
        })}</ul> : <p className="popup-annotations__empty">Aucun dessin existant.</p>}
        {canEdit && activeTemplates.length > 0 && !adding && !editingAnnotation && <button type="button" className="secondary-button popup-annotations__add" onClick={startAdding}><Plus size={15} />Ajouter</button>}
        {canEdit && formTemplate && (adding || editingAnnotation) && <div className="popup-annotations__form">
          <label>Type d’annotation<select aria-label="Type d’annotation" value={formTemplate.id} disabled={Boolean(editingAnnotation)} onChange={(event) => setTemplateId(event.target.value)}>{editingAnnotation ? <option value={formTemplate.id}>{formTemplate.name}</option> : activeTemplates.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <label>Titre facultatif<input aria-label="Nom de l’annotation" placeholder="Ex. zone de stationnement" maxLength={160} value={title} onChange={(event) => setTitle(event.target.value)} /></label>
          <label>Commentaire facultatif<textarea aria-label="Commentaire de l’annotation" placeholder="Ajouter un commentaire…" maxLength={10000} value={description} onChange={(event) => setDescription(event.target.value)} /></label>
          <div className="popup-annotations__form-actions">{editingAnnotation ? <button type="button" className="primary-button popup-annotations__draw" disabled={saving} onClick={() => void saveEdit()}><Save size={15} />Sauvegarder</button> : <button type="button" className="primary-button popup-annotations__draw" onClick={startDrawing}><MapPinned size={15} />Dessiner sur la carte</button>}<button type="button" className="secondary-button popup-annotations__cancel" disabled={saving} onClick={resetForm}><X size={14} />Annuler</button></div>
          {!editingAnnotation && <p className="popup-annotations__hint">Maintenez puis faites glisser sur la carte pour tracer la forme.</p>}
        </div>}
        {canEdit && activeTemplates.length === 0 && <p className="popup-annotations__template-hint">Créez d’abord un modèle dans l’organisation de la carte.</p>}
        {error && <p className="form-alert" role="alert">{error}</p>}
      </>}
    </div>}
  </section>
}
