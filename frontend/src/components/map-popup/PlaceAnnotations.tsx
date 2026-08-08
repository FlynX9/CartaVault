import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, MapPinned, Trash2 } from 'lucide-react'

import { deletePlaceAnnotation, getAnnotationTemplates, getPlaceAnnotations } from '../../api/annotations'
import type { AnnotationTemplate, PlaceAnnotation } from '../../types/annotation'

export function PlaceAnnotations({ placeId, mapId, canEdit, onChanged }: { placeId: string; mapId: string; canEdit: boolean; onChanged?: (annotations: PlaceAnnotation[]) => void }) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [templates, setTemplates] = useState<AnnotationTemplate[]>([])
  const [annotations, setAnnotations] = useState<PlaceAnnotation[]>([])
  const [templateId, setTemplateId] = useState('')
  const [title, setTitle] = useState('')
  const [error, setError] = useState<string | null>(null)
  const activeTemplates = useMemo(() => templates.filter((item) => item.is_active), [templates])
  const selectedTemplate = activeTemplates.find((item) => item.id === templateId) ?? null

  useEffect(() => {
    if (!open) return
    const controller = new AbortController()
    setLoading(true)
    setError(null)
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
  }, [mapId, onChanged, open, placeId])

  const remove = async (id: string) => {
    try {
      await deletePlaceAnnotation(placeId, id)
      const next = annotations.filter((item) => item.id !== id)
      setAnnotations(next)
      onChanged?.(next)
      window.dispatchEvent(new CustomEvent('cartavault:annotations-updated', { detail: { placeId } }))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Suppression impossible.')
    }
  }

  const startDrawing = () => {
    if (!selectedTemplate) return
    window.dispatchEvent(new CustomEvent('cartavault:annotation-draw-requested', {
      detail: { placeId, template: selectedTemplate, title: title.trim() || null },
    }))
    setTitle('')
  }

  return <section className="popup-annotations">
    <button type="button" className="popup-annotations__toggle" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
      <MapPinned size={16} /><span>Plan / annotations</span><b>{annotations.length}</b><ChevronDown size={16} />
    </button>
    {open && <div className="popup-annotations__body">
      {loading ? <p>Chargement…</p> : <>
        {annotations.length > 0 && <ul>{annotations.map((item) => <li key={item.id}><i style={{ background: item.template.color }} /><span>{item.title || item.template.name}</span>{canEdit && <button type="button" aria-label="Supprimer l’annotation" title="Supprimer" onClick={() => void remove(item.id)}><Trash2 size={14} /></button>}</li>)}</ul>}
        {canEdit && activeTemplates.length > 0 && <div className="popup-annotations__form">
          <label>Type d’annotation
            <select value={templateId} onChange={(event) => setTemplateId(event.target.value)}>{activeTemplates.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
          </label>
          <label>Titre facultatif
            <input placeholder="Ex. zone de stationnement" value={title} onChange={(event) => setTitle(event.target.value)} />
          </label>
          <button type="button" className="secondary-button popup-annotations__draw" onClick={startDrawing}><MapPinned size={15} />Dessiner sur la carte</button>
          <p className="popup-annotations__hint">Maintenez puis faites glisser sur la carte pour tracer la forme.</p>
        </div>}
        {canEdit && activeTemplates.length === 0 && <p>Créez d’abord un modèle dans l’organisation de la carte.</p>}
        {error && <p className="form-alert" role="alert">{error}</p>}
      </>}
    </div>}
  </section>
}
