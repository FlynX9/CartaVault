import { useCallback, useEffect, useRef, useState, type MouseEvent, type TouchEvent } from 'react'
import { ChevronLeft, ChevronRight, Copy, GalleryHorizontal, List, Pencil, Plus, Star, Trash2 } from 'lucide-react'

import { createQuotaProfile, deleteQuotaProfile, duplicateQuotaProfile, getQuotaProfiles, getQuotaRegistry, setDefaultQuotaProfile, updateQuotaProfile } from '../../../api/adminConsole'
import { useConfirmDialog } from '../../../components/common/useConfirmDialog'
import type { QuotaProfile, QuotaRegistryItem } from '../../../types/adminConsole'
import { QuotaProfileModal, type QuotaProfileDraft } from './QuotaProfileModal'

const VIEW_STORAGE_KEY = 'cartavault:quota-profiles-view'
type ViewMode = 'carousel' | 'list'
function getInitialViewMode(): ViewMode { try { return localStorage.getItem(VIEW_STORAGE_KEY) === 'list' ? 'list' : 'carousel' } catch { return 'carousel' } }
function persistViewMode(mode: ViewMode) { try { localStorage.setItem(VIEW_STORAGE_KEY, mode) } catch { /* The view remains usable when storage is unavailable. */ } }
function formatLimit(value: number | null, unit: string) {
  if (value === null) return unit === 'megabytes' || unit === 'pixels' ? 'Réglage général' : 'Illimité'
  if (unit !== 'bytes') return new Intl.NumberFormat('fr-FR').format(value)
  return `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(value / 1024 ** 3)} Gio`
}

function quotaProfileName(profile: QuotaProfile) {
  return profile.is_system && profile.name === 'Unlimited' ? 'Illimité' : profile.name
}

function QuotaProfileCard({ profile, registry, selected, variant, onSelect, onAction }: { profile: QuotaProfile; registry: QuotaRegistryItem[]; selected: boolean; variant: ViewMode; onSelect: () => void; onAction: (kind: 'edit' | 'duplicate' | 'default' | 'delete') => void }) {
  const stop = (callback: () => void) => (event: MouseEvent) => { event.stopPropagation(); callback() }
  return <article className={`admin-console__card quota-profile quota-profile--${variant} ${selected ? 'is-selected' : ''}`} aria-current={selected ? 'true' : undefined} tabIndex={0} onClick={onSelect} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect() } }}>
    <header><div><h3>{quotaProfileName(profile)}</h3><div className="quota-profile__badges">{profile.is_default && <span>Par défaut</span>}{profile.is_system && <span>Système</span>}</div></div><strong>{profile.assigned_users_count} utilisateur(s)</strong></header>
    <p>{profile.description || 'Aucune description.'}</p>
    <dl>{registry.slice(0, 4).map((item) => <div key={item.key}><dt>{item.label}</dt><dd>{formatLimit(profile.limits[item.key], item.unit)}</dd></div>)}</dl>
    <small>Mis à jour le {new Date(profile.updated_at).toLocaleDateString('fr-FR')}</small>
    <footer className="admin-console__actions quota-profile__actions"><button type="button" disabled={profile.is_system} title={profile.is_system ? 'Le profil système Illimité ne peut pas être modifié.' : ''} onClick={stop(() => onAction('edit'))}><Pencil size={15} />Modifier</button><button type="button" onClick={stop(() => onAction('duplicate'))}><Copy size={15} />Dupliquer</button><button type="button" disabled={profile.is_default || !profile.is_active} title={profile.is_default ? 'Ce profil est déjà le profil par défaut.' : 'Profil indisponible.'} onClick={stop(() => onAction('default'))}><Star size={15} />Par défaut</button><button className="danger" type="button" disabled={profile.is_system || profile.is_default || profile.assigned_users_count > 0} title={profile.assigned_users_count > 0 ? 'Réaffectez les utilisateurs avant suppression.' : ''} onClick={stop(() => onAction('delete'))}><Trash2 size={15} />Supprimer</button></footer>
  </article>
}

function QuotaProfilesCarousel({ profiles, registry, selectedProfileId, onSelect, onAction }: { profiles: QuotaProfile[]; registry: QuotaRegistryItem[]; selectedProfileId: string | null; onSelect: (id: string) => void; onAction: (profile: QuotaProfile, kind: 'edit' | 'duplicate' | 'default' | 'delete') => void }) {
  const selectedIndex = Math.max(0, profiles.findIndex((profile) => profile.id === selectedProfileId))
  const touchStart = useRef<{ x: number; y: number } | null>(null)
  const selectIndex = useCallback((index: number) => {
    if (profiles.length === 0) return
    const profile = profiles[(index + profiles.length) % profiles.length]
    if (profile) onSelect(profile.id)
  }, [onSelect, profiles])
  const startSwipe = (event: TouchEvent<HTMLDivElement>) => {
    const touch = event.touches[0]
    if (touch) touchStart.current = { x: touch.clientX, y: touch.clientY }
  }
  const finishSwipe = (event: TouchEvent<HTMLDivElement>) => {
    const start = touchStart.current
    const touch = event.changedTouches[0]
    touchStart.current = null
    if (!start || !touch) return
    const deltaX = touch.clientX - start.x
    const deltaY = touch.clientY - start.y
    if (Math.abs(deltaX) < 42 || Math.abs(deltaX) <= Math.abs(deltaY)) return
    selectIndex(selectedIndex + (deltaX < 0 ? 1 : -1))
  }
  if (profiles.length === 0) return <p className="quota-profiles__empty">Aucun profil de quotas.</p>
  const previousIndex = (selectedIndex - 1 + profiles.length) % profiles.length
  const nextIndex = (selectedIndex + 1) % profiles.length
  return <section className="quota-carousel" aria-label="Profils de quotas">
    <div className="quota-carousel__viewport" onTouchStart={startSwipe} onTouchEnd={finishSwipe}>
      <div className="quota-carousel__container">{profiles.map((profile, index) => {
        const position = index === selectedIndex ? 'is-current' : profiles.length > 1 && index === previousIndex ? 'is-previous' : profiles.length > 2 && index === nextIndex ? 'is-next' : 'is-distant'
        return <div className={`quota-carousel__slide ${position}`} key={profile.id} aria-hidden={index !== selectedIndex} onClick={index === selectedIndex ? undefined : () => selectIndex(index)}><QuotaProfileCard profile={profile} registry={registry} selected={profile.id === selectedProfileId} variant="carousel" onSelect={() => onSelect(profile.id)} onAction={(kind) => onAction(profile, kind)} /></div>
      })}</div>
    </div>
    <button className="quota-carousel__arrow quota-carousel__arrow--previous" type="button" aria-label="Profil précédent" title="Profil précédent" disabled={profiles.length < 2} onClick={() => selectIndex(selectedIndex - 1)}><ChevronLeft size={18} /></button>
    <button className="quota-carousel__arrow quota-carousel__arrow--next" type="button" aria-label="Profil suivant" title="Profil suivant" disabled={profiles.length < 2} onClick={() => selectIndex(selectedIndex + 1)}><ChevronRight size={18} /></button>
    {profiles.length > 1 && <div className="quota-carousel__pagination" aria-label={`Profil ${selectedIndex + 1} sur ${profiles.length}`}>{profiles.map((profile, index) => <button key={profile.id} type="button" className={index === selectedIndex ? 'is-active' : ''} aria-label={`Afficher ${profile.name}`} aria-current={index === selectedIndex ? 'true' : undefined} onClick={() => selectIndex(index)} />)}</div>}
  </section>
}

export function QuotaProfilesPage() {
  const [profiles, setProfiles] = useState<QuotaProfile[]>([]); const [registry, setRegistry] = useState<QuotaRegistryItem[]>([]); const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null); const [editing, setEditing] = useState<QuotaProfile | null | undefined>(undefined); const [viewMode, setViewMode] = useState<ViewMode>(getInitialViewMode); const [loading, setLoading] = useState(true); const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null); const [modalError, setModalError] = useState<string | null>(null); const { confirm, confirmationDialog } = useConfirmDialog({ overlayClassName: 'account-admin-modal-overlay' })
  const load = useCallback((signal?: AbortSignal) => { setLoading(true); setError(null); void Promise.all([getQuotaProfiles(signal), getQuotaRegistry(signal)]).then(([items, definitions]) => { if (!signal?.aborted) { setProfiles(items); setRegistry(definitions); setSelectedProfileId((current) => items.some((profile) => profile.id === current) ? current : items[0]?.id ?? null) } }).catch((reason: unknown) => { if (!signal?.aborted) setError(reason instanceof Error ? reason.message : 'Chargement impossible.') }).finally(() => { if (!signal?.aborted) setLoading(false) }) }, [])
  useEffect(() => { const controller = new AbortController(); load(controller.signal); return () => controller.abort() }, [load])
  const selectProfile = useCallback((id: string) => { setSelectedProfileId((current) => current === id ? current : id) }, [])
  const changeView = (mode: ViewMode) => { setViewMode(mode); persistViewMode(mode) }
  const begin = (profile: QuotaProfile | null) => { setEditing(profile); if (profile) setSelectedProfileId(profile.id); setModalError(null) }
  const save = async (draft: QuotaProfileDraft) => { setBusy(true); setModalError(null); try { const payload = { name: draft.name, description: draft.description || null, is_active: draft.is_active, limits: draft.limits }; const saved = editing ? await updateQuotaProfile(editing.id, payload) : await createQuotaProfile(payload); setProfiles((items) => editing ? items.map((item) => item.id === saved.id ? saved : item) : [...items, saved]); setSelectedProfileId(saved.id); setEditing(undefined) } catch (reason) { setModalError(reason instanceof Error ? reason.message : 'Enregistrement impossible.') } finally { setBusy(false) } }
  const action = async (profile: QuotaProfile, kind: 'edit' | 'duplicate' | 'default' | 'delete') => { if (kind === 'edit') { begin(profile); return }; if (kind === 'delete' && !await confirm({ title: `Supprimer ${profile.name}`, message: 'Cette action est définitive. Les profils affectés ou par défaut ne peuvent pas être supprimés.', confirmLabel: 'Supprimer' })) return; try { if (kind === 'duplicate') { const copy = await duplicateQuotaProfile(profile.id); setProfiles((items) => [...items, copy]); setSelectedProfileId(copy.id); begin(copy); return }; if (kind === 'default') { const updated = await setDefaultQuotaProfile(profile.id); setProfiles((items) => items.map((item) => ({ ...item, is_default: item.id === updated.id }))) }; if (kind === 'delete') { await deleteQuotaProfile(profile.id); setProfiles((items) => items.filter((item) => item.id !== profile.id)); setSelectedProfileId((current) => current === profile.id ? profiles.find((item) => item.id !== profile.id)?.id ?? null : current) } } catch (reason) { setError(reason instanceof Error ? reason.message : 'Opération impossible.') } }
  return <section className="quota-profiles"><header className="admin-console__heading"><div><span>Capacité</span><h2>Quotas</h2><p>Profils réutilisables et limites de création appliquées aux utilisateurs.</p></div><button className="primary-button" type="button" onClick={() => begin(null)}><Plus size={16} />Nouveau profil</button></header>{error && <div className="form-alert" role="alert">{error}</div>}{!loading && <div className="quota-profiles__toolbar" role="group" aria-label="Mode d’affichage"><button type="button" className={viewMode === 'carousel' ? 'is-active' : ''} aria-label="Vue carrousel" title="Vue carrousel" aria-pressed={viewMode === 'carousel'} onClick={() => changeView('carousel')}><GalleryHorizontal size={16} />Carrousel</button><button type="button" className={viewMode === 'list' ? 'is-active' : ''} aria-label="Vue liste" title="Vue liste" aria-pressed={viewMode === 'list'} onClick={() => changeView('list')}><List size={16} />Liste</button></div>}{loading ? <p role="status">Chargement…</p> : profiles.length === 0 ? <p className="quota-profiles__empty">Aucun profil de quotas.</p> : viewMode === 'carousel' ? <QuotaProfilesCarousel profiles={profiles} registry={registry} selectedProfileId={selectedProfileId} onSelect={selectProfile} onAction={action} /> : <div className="quota-profiles__grid">{profiles.map((profile) => <QuotaProfileCard key={profile.id} profile={profile} registry={registry} selected={profile.id === selectedProfileId} variant="list" onSelect={() => selectProfile(profile.id)} onAction={(kind) => action(profile, kind)} />)}</div>}{editing !== undefined && <QuotaProfileModal key={editing?.id ?? 'new'} profile={editing} registry={registry} busy={busy} serverError={modalError} onClose={() => { setEditing(undefined); setModalError(null) }} onSave={save} />}{confirmationDialog}</section>
}
