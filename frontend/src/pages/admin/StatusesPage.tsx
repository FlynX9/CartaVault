import { useEffect, useState, type FormEvent } from 'react'

import { createStatus, deleteStatus, getStatuses, updateStatus } from '../../api/statuses'
import type { PlaceStatus } from '../../types/status'

const EMPTY_FORM = { name: '', color: '#2563EB', sort_order: '0', is_active: true, is_default: false }

export function StatusesPage() {
  const [statuses, setStatuses] = useState<PlaceStatus[]>([])
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<PlaceStatus | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [error, setError] = useState<string | null>(null)
  const [refresh, setRefresh] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    void getStatuses(controller.signal, { q: search || undefined })
      .then(setStatuses)
      .catch((caught: unknown) => { if (!(caught instanceof Error && caught.name === 'AbortError')) setError(caught instanceof Error ? caught.message : 'Chargement impossible.') })
    return () => controller.abort()
  }, [search, refresh])

  const select = (item: PlaceStatus) => {
    setEditing(item)
    setForm({ name: item.name, color: item.color, sort_order: String(item.sort_order), is_active: item.is_active, is_default: item.is_default })
    setError(null)
  }
  const reset = () => { setEditing(null); setForm(EMPTY_FORM); setError(null) }
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError(null)
    const payload = { name: form.name.trim(), color: form.color.toUpperCase(), sort_order: Number(form.sort_order), is_active: form.is_active, is_default: form.is_default }
    try {
      if (editing) await updateStatus(editing.id, payload)
      else await createStatus(payload)
      reset(); setRefresh((value) => value + 1)
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Enregistrement impossible.') }
  }
  const remove = async (item: PlaceStatus) => {
    if (!window.confirm(`Supprimer « ${item.name} » ?`)) return
    try { await deleteStatus(item.id); if (editing?.id === item.id) reset(); setRefresh((value) => value + 1) }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Suppression impossible.') }
  }

  return <section className="admin-page">
    <header className="admin-page-header"><div><p className="details-kicker">Configuration</p><h2>Statuts de suivi</h2></div><button className="primary-button" type="button" onClick={reset}>Nouveau statut</button></header>
    <label className="admin-search"><span>Rechercher par nom ou slug</span><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
    {error && <p className="form-alert" role="alert">{error}</p>}
    <form className="admin-form" onSubmit={(event) => void submit(event)}>
      <h3>{editing ? `Modifier ${editing.name}` : 'Créer un statut'}</h3>
      <div className="status-form-grid">
        <label className="form-field"><span>Nom *</span><input required maxLength={100} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
        <label className="form-field"><span>Couleur *</span><span className="color-inputs"><input aria-label="Sélecteur de couleur" type="color" value={form.color} onChange={(event) => setForm({ ...form, color: event.target.value.toUpperCase() })} /><input aria-label="Couleur hexadécimale" required pattern="#[0-9A-Fa-f]{6}" value={form.color} onChange={(event) => setForm({ ...form, color: event.target.value })} /></span></label>
        <label className="form-field"><span>Ordre</span><input type="number" min="0" required value={form.sort_order} onChange={(event) => setForm({ ...form, sort_order: event.target.value })} /></label>
        <label className="checkbox-field"><input type="checkbox" checked={form.is_active} onChange={(event) => setForm({ ...form, is_active: event.target.checked })} /><span>Actif</span></label>
        <label className="checkbox-field"><input type="checkbox" checked={form.is_default} onChange={(event) => setForm({ ...form, is_default: event.target.checked })} /><span>Statut par défaut</span></label>
      </div>
      <div className="admin-form-actions"><button className="primary-button" type="submit">Enregistrer</button>{editing && <button className="secondary-button" type="button" onClick={reset}>Annuler</button>}</div>
    </form>
    <ul className="admin-entity-list">{statuses.map((item) => <li key={item.id}><div className="status-summary"><span className="status-dot" style={{ backgroundColor: item.color }} /><div><strong>{item.name}</strong><p>{item.slug} · ordre {item.sort_order} · {item.places_count} POI · {item.is_active ? 'actif' : 'inactif'}{item.is_default ? ' · par défaut' : ''}</p></div></div><div className="entity-actions"><button className="secondary-button" type="button" onClick={() => select(item)}>Modifier</button><button className="danger-button" type="button" disabled={item.is_default || item.places_count > 0} onClick={() => void remove(item)}>Supprimer</button></div></li>)}</ul>
  </section>
}
