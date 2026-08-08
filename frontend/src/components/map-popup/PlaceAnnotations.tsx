import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, MapPinned, Plus, Trash2 } from 'lucide-react'

import { createPlaceAnnotation, deletePlaceAnnotation, getAnnotationTemplates, getPlaceAnnotations } from '../../api/annotations'
import type { AnnotationShapeType, AnnotationTemplate, PlaceAnnotation } from '../../types/annotation'

function initialGeometry(shape: AnnotationShapeType): GeoJSON.Geometry {
  if (shape === 'circle') return { type: 'Point', coordinates: [0, 0] }
  if (shape === 'line') return { type: 'LineString', coordinates: [[0, 0], [0.001, 0.001]] }
  if (shape === 'path') return { type: 'LineString', coordinates: [[0, 0], [0.001, 0.001], [0.002, 0.001]] }
  const points = shape === 'triangle' ? [[0, 0], [0.001, 0], [0.0005, 0.001], [0, 0]] : [[0, 0], [0.001, 0], [0.001, 0.001], [0, 0.001], [0, 0]]
  return { type: 'Polygon', coordinates: [points] }
}

export function PlaceAnnotations({ placeId, mapId, canEdit, onChanged }: { placeId: string; mapId: string; canEdit: boolean; onChanged?: (annotations: PlaceAnnotation[]) => void }) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [templates, setTemplates] = useState<AnnotationTemplate[]>([])
  const [annotations, setAnnotations] = useState<PlaceAnnotation[]>([])
  const [templateId, setTemplateId] = useState('')
  const [geometry, setGeometry] = useState('')
  const [radius, setRadius] = useState('50')
  const [title, setTitle] = useState('')
  const [error, setError] = useState<string | null>(null)
  const activeTemplates = useMemo(() => templates.filter((item) => item.is_active), [templates])
  const selectedTemplate = activeTemplates.find((item) => item.id === templateId) ?? null

  useEffect(() => {
    if (!open) return
    const controller = new AbortController(); setLoading(true); setError(null)
    Promise.all([getAnnotationTemplates(mapId, controller.signal), getPlaceAnnotations(placeId, controller.signal)]).then(([nextTemplates, nextAnnotations]) => {
      setTemplates(nextTemplates); setAnnotations(nextAnnotations); onChanged?.(nextAnnotations)
      const first = nextTemplates.find((item) => item.is_active)
      if (first) { setTemplateId((current) => current || first.id); setGeometry((current) => current || JSON.stringify(initialGeometry(first.shape_type), null, 2)) }
    }).catch((caught: unknown) => { if (!(caught instanceof Error && caught.name === 'AbortError')) setError(caught instanceof Error ? caught.message : 'Impossible de charger les annotations.') }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [mapId, onChanged, open, placeId])

  const changeTemplate = (id: string) => {
    setTemplateId(id); const next = activeTemplates.find((item) => item.id === id)
    if (next) { setGeometry(JSON.stringify(initialGeometry(next.shape_type), null, 2)); setRadius(next.shape_type === 'circle' ? '50' : '') }
  }
  const add = async () => {
    if (!selectedTemplate) return
    setError(null)
    try {
      const parsed = JSON.parse(geometry) as GeoJSON.Geometry
      const created = await createPlaceAnnotation(placeId, { template_id: selectedTemplate.id, geometry: parsed, ...(selectedTemplate.shape_type === 'circle' ? { radius_meters: Number(radius) } : {}), title: title.trim() || null })
      const next = [...annotations, created]; setAnnotations(next); setTitle(''); onChanged?.(next)
      window.dispatchEvent(new CustomEvent('cartavault:annotations-updated', { detail: { placeId } }))
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Géométrie invalide.') }
  }
  const remove = async (id: string) => {
    try { await deletePlaceAnnotation(placeId, id); const next = annotations.filter((item) => item.id !== id); setAnnotations(next); onChanged?.(next); window.dispatchEvent(new CustomEvent('cartavault:annotations-updated', { detail: { placeId } })) } catch (caught) { setError(caught instanceof Error ? caught.message : 'Suppression impossible.') }
  }

  return <section className="popup-annotations"><button type="button" className="popup-annotations__toggle" aria-expanded={open} onClick={() => setOpen((value) => !value)}><MapPinned size={16} /><span>Plan / annotations</span><b>{annotations.length}</b><ChevronDown size={16} /></button>{open && <div className="popup-annotations__body">{loading ? <p>Chargement…</p> : <>{annotations.length > 0 && <ul>{annotations.map((item) => <li key={item.id}><i style={{ background: item.template.color }} /><span>{item.title || item.template.name}</span>{canEdit && <button type="button" aria-label="Supprimer l’annotation" title="Supprimer" onClick={() => void remove(item.id)}><Trash2 size={14} /></button>}</li>)}</ul>}{canEdit && activeTemplates.length > 0 && <div className="popup-annotations__form"><select aria-label="Modèle d’annotation" value={templateId} onChange={(event) => changeTemplate(event.target.value)}>{activeTemplates.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><button type="button" className="secondary-button" onClick={() => selectedTemplate && window.dispatchEvent(new CustomEvent('cartavault:annotation-draw-requested', { detail: { placeId, template: selectedTemplate } }))}><MapPinned size={15} />Dessiner sur la carte</button><input aria-label="Titre facultatif" placeholder="Titre facultatif" value={title} onChange={(event) => setTitle(event.target.value)} />{selectedTemplate?.shape_type === 'circle' && <input aria-label="Rayon en mètres" type="number" min="1" value={radius} onChange={(event) => setRadius(event.target.value)} />}<textarea aria-label="Géométrie GeoJSON" value={geometry} onChange={(event) => setGeometry(event.target.value)} rows={4} /><button type="button" className="secondary-button" onClick={() => void add()}><Plus size={15} />Ajouter</button></div>}{canEdit && activeTemplates.length === 0 && <p>Créez d’abord un modèle dans l’organisation de la carte.</p>}{error && <p className="form-alert" role="alert">{error}</p>}</>}</div>}</section>
}
