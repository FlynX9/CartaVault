import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Archive, Copy, Pencil, Plus, Save, Star, Trash2, X } from 'lucide-react'

import {
  archiveQuotaProfile, createQuotaProfile, deleteQuotaProfile, duplicateQuotaProfile,
  getQuotaProfiles, getQuotaRegistry, setDefaultQuotaProfile, updateQuotaProfile,
} from '../../../api/adminConsole'
import { useConfirmDialog } from '../../../components/common/useConfirmDialog'
import type { QuotaLimits, QuotaProfile, QuotaRegistryItem } from '../../../types/adminConsole'

const EMPTY_LIMITS: QuotaLimits = {
  maps_max: null, trips_total_max: null, storage_bytes_max: null, photos_total_max: null,
  memberships_total_max: null, pending_invitations_max: null, places_per_map_max: null,
  tags_per_map_max: null, categories_per_map_max: null, statuses_per_map_max: null,
  trips_per_map_max: null, members_per_map_max: null, pending_invitations_per_map_max: null,
  photos_per_place_max: null, links_per_place_max: null, days_per_trip_max: null, steps_per_day_max: null,
}

type Draft = { name: string; description: string; is_active: boolean; limits: QuotaLimits }
const scopes: Array<{ key: QuotaRegistryItem['scope']; label: string }> = [
  { key: 'user', label: 'Compte' }, { key: 'map', label: 'Carte' }, { key: 'place', label: 'Lieu' },
  { key: 'trip', label: 'Sortie' }, { key: 'day', label: 'Journée' },
]

function toDraft(profile?: QuotaProfile): Draft {
  return profile
    ? { name: profile.name, description: profile.description ?? '', is_active: profile.is_active, limits: { ...profile.limits } }
    : { name: '', description: '', is_active: true, limits: { ...EMPTY_LIMITS } }
}

function formatLimit(value: number | null, unit: string) {
  if (value === null) return 'Illimité'
  if (unit !== 'bytes') return new Intl.NumberFormat('fr-FR').format(value)
  const gib = value / 1024 ** 3
  return `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(gib)} Gio`
}

export function QuotaProfilesPage() {
  const [profiles, setProfiles] = useState<QuotaProfile[]>([])
  const [registry, setRegistry] = useState<QuotaRegistryItem[]>([])
  const [editing, setEditing] = useState<QuotaProfile | null | undefined>(undefined)
  const [draft, setDraft] = useState<Draft>(toDraft())
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { confirm, confirmationDialog } = useConfirmDialog()

  const load = useCallback((signal?: AbortSignal) => {
    setLoading(true); setError(null)
    void Promise.all([getQuotaProfiles(signal), getQuotaRegistry(signal)])
      .then(([nextProfiles, nextRegistry]) => { if (!signal?.aborted) { setProfiles(nextProfiles); setRegistry(nextRegistry) } })
      .catch((reason: unknown) => { if (!signal?.aborted) setError(reason instanceof Error ? reason.message : 'Chargement impossible.') })
      .finally(() => { if (!signal?.aborted) setLoading(false) })
  }, [])
  useEffect(() => { const controller = new AbortController(); load(controller.signal); return () => controller.abort() }, [load])

  const begin = (profile: QuotaProfile | null) => { setEditing(profile); setDraft(toDraft(profile ?? undefined)); setError(null) }
  const save = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError(null)
    try {
      const payload = { name: draft.name.trim(), description: draft.description.trim() || null, is_active: draft.is_active, limits: draft.limits }
      if (editing) await updateQuotaProfile(editing.id, payload)
      else await createQuotaProfile(payload)
      setEditing(undefined); load()
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Enregistrement impossible.') }
    finally { setBusy(false) }
  }
  const action = async (profile: QuotaProfile, kind: 'duplicate' | 'default' | 'archive' | 'delete') => {
    if (kind === 'delete' && !await confirm({ title: `Supprimer ${profile.name}`, message: 'Cette action est définitive. Les profils affectés ou par défaut ne peuvent pas être supprimés.', confirmLabel: 'Supprimer' })) return
    try {
      if (kind === 'duplicate') { const copy = await duplicateQuotaProfile(profile.id); setProfiles((items) => [...items, copy]); begin(copy); return }
      if (kind === 'default') await setDefaultQuotaProfile(profile.id)
      if (kind === 'archive') await archiveQuotaProfile(profile.id)
      if (kind === 'delete') await deleteQuotaProfile(profile.id)
      load()
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Opération impossible.') }
  }
  const registryByScope = useMemo(() => new Map(scopes.map(({ key }) => [key, registry.filter((item) => item.scope === key)])), [registry])

  return <section className="quota-profiles">
    <header className="admin-console__heading"><div><span>Capacité</span><h2>Quotas</h2><p>Profils réutilisables et limites de création appliquées aux utilisateurs.</p></div><button className="primary-button" type="button" onClick={() => begin(null)}><Plus size={16} />Nouveau profil</button></header>
    {error && <div className="form-alert" role="alert">{error}</div>}
    {loading ? <p role="status">Chargement…</p> : <div className="quota-profiles__grid">{profiles.map((profile) => <article className={`admin-console__card quota-profile ${!profile.is_active ? 'is-archived' : ''}`} key={profile.id}>
      <header><div><h3>{profile.name}</h3><div className="quota-profile__badges">{profile.is_default && <span>Par défaut</span>}{profile.is_system && <span>Système</span>}{!profile.is_active && <span>Archivé</span>}</div></div><strong>{profile.assigned_users_count} utilisateur(s)</strong></header>
      <p>{profile.description || 'Aucune description.'}</p>
      <dl>{registry.slice(0, 4).map((item) => <div key={item.key}><dt>{item.label}</dt><dd>{formatLimit(profile.limits[item.key], item.unit)}</dd></div>)}</dl>
      <small>Mis à jour le {new Date(profile.updated_at).toLocaleDateString('fr-FR')}</small>
      <footer className="admin-console__actions"><button type="button" onClick={() => begin(profile)}><Pencil size={15} />Modifier</button><button type="button" onClick={() => void action(profile, 'duplicate')}><Copy size={15} />Dupliquer</button><button type="button" disabled={profile.is_default || !profile.is_active} title={profile.is_default ? 'Ce profil est déjà le profil par défaut.' : !profile.is_active ? 'Réactivez ce profil avant de le définir par défaut.' : ''} onClick={() => void action(profile, 'default')}><Star size={15} />Par défaut</button><button type="button" disabled={profile.is_system || profile.is_default || profile.assigned_users_count > 0} title={profile.assigned_users_count > 0 ? 'Réaffectez les utilisateurs avant archivage.' : ''} onClick={() => void action(profile, 'archive')}><Archive size={15} />Archiver</button><button className="danger" type="button" disabled={profile.is_system || profile.is_default || profile.assigned_users_count > 0} onClick={() => void action(profile, 'delete')}><Trash2 size={15} />Supprimer</button></footer>
    </article>)}</div>}
    {editing !== undefined && <form className="admin-console__card quota-editor" onSubmit={save}>
      <header><div><h3>{editing ? `Modifier ${editing.name}` : 'Créer un profil'}</h3><p><code>null</code> correspond à une limite illimitée ; zéro interdit toute nouvelle création.</p></div><button type="button" aria-label="Fermer l’éditeur" onClick={() => setEditing(undefined)}><X size={16} /></button></header>
      <div className="quota-editor__identity"><label>Nom<input required maxLength={100} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label><label>Description<textarea maxLength={2000} value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></label><label className="quota-editor__check"><input type="checkbox" checked={draft.is_active} disabled={Boolean(editing?.is_default)} onChange={(event) => setDraft({ ...draft, is_active: event.target.checked })} />Profil actif</label></div>
      {scopes.map((scope) => <fieldset key={scope.key}><legend>{scope.label}</legend><div className="quota-editor__limits">{registryByScope.get(scope.key)?.map((item) => { const value = draft.limits[item.key]; const storage = item.unit === 'bytes'; return <label key={item.key}><span><strong>{item.label}</strong><small>{item.description}{!item.enforced ? ' · Non appliqué actuellement' : ''}</small></span><span className="quota-editor__control"><span><input type="checkbox" checked={value === null} disabled={Boolean(editing?.is_system)} onChange={(event) => setDraft({ ...draft, limits: { ...draft.limits, [item.key]: event.target.checked ? null : 0 } })} />Illimité</span><input type="number" min={0} max={storage ? undefined : item.maximum} disabled={value === null || Boolean(editing?.is_system)} value={value === null ? '' : storage ? value / 1024 ** 3 : value} onChange={(event) => { const entered = Number(event.target.value); setDraft({ ...draft, limits: { ...draft.limits, [item.key]: storage ? Math.round(entered * 1024 ** 3) : entered } }) }} /><em>{storage ? 'Gio' : item.unit === 'count' ? 'éléments' : item.unit}</em></span></label> })}</div></fieldset>)}
      <footer className="admin-console__actions"><button className="primary-button" disabled={busy || !draft.name.trim()}><Save size={16} />Enregistrer</button><button type="button" onClick={() => setEditing(undefined)}>Annuler</button></footer>
    </form>}
    {confirmationDialog}
  </section>
}
