import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import { Activity, Check, ChevronLeft, ChevronRight, Gauge, KeyRound, RefreshCw, Save, ShieldCheck, Trash2, Users, X } from 'lucide-react'
import { Navigate, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom'

import {
  deleteResendCredential, getAdminCredentials, getAdminQuotas, getAdminUsers,
  saveAdminQuotas, saveResendCredential, saveUserQuota, updateAdminUser, verifyResendCredential,
} from '../../api/adminConsole'
import { getRegistrationRequests, reviewRegistration, type RegistrationRequest } from '../../api/registration'
import { useConfirmDialog } from '../../components/common/useConfirmDialog'
import { InstanceStatusPage } from '../../features/admin/instance-status/InstanceStatusPage'
import type { AdminRole, AdminUser, AdminUserPage, AdminUserState, CredentialStatus, QuotaLimits, QuotaOverview, UserQuota } from '../../types/adminConsole'

const sections = [
  ['users', Users, 'Utilisateurs'], ['credentials', KeyRound, 'Clés API'],
  ['quotas', Gauge, 'Quotas et usages'], ['instance', Activity, 'État de l’instance'],
] as const

export function AdminConsole({ onClose }: { onClose?: () => void } = {}) {
  const location = useLocation()
  const navigate = useNavigate()
  const modal = useRef<HTMLElement>(null)
  const closeButton = useRef<HTMLButtonElement>(null)
  const requestClose = useCallback(() => { if (onClose) onClose(); else navigate('/') }, [navigate, onClose])
  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeButton.current?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      const nestedModal = document.querySelector('[role="alertdialog"][aria-modal="true"]')
      if (nestedModal !== null && !modal.current?.contains(nestedModal)) return
      if (event.key === 'Escape') { event.preventDefault(); requestClose(); return }
      if (event.key !== 'Tab' || !modal.current) return
      const focusable = [...modal.current.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), [href], [tabindex]:not([tabindex="-1"])')]
      if (focusable.length === 0) return
      const first = focusable[0]; const last = focusable.at(-1)!
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => { document.body.style.overflow = previousOverflow; window.removeEventListener('keydown', onKeyDown) }
  }, [requestClose])
  return createPortal(<div className="account-overlay admin-console-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) requestClose() }}>
    <section ref={modal} className="admin-console" role="dialog" aria-modal="true" aria-labelledby="admin-console-title">
      <header className="admin-console__header"><div className="admin-console__header-icon"><ShieldCheck size={20} /></div><div><h2 id="admin-console-title">Administration</h2><p>Configuration et supervision de l’instance CartaVault.</p></div><button ref={closeButton} className="panel-icon-button" type="button" aria-label="Fermer l’administration" onClick={requestClose}><X size={18} /></button></header>
      <nav className="admin-console__nav" aria-label="Sections d’administration">
        {sections.map(([path, Icon, label]) => <NavLink key={path} to={{ pathname: `/admin/${path}`, search: location.search }}><Icon size={18} /><span>{label}</span></NavLink>)}
      </nav>
      <div className="admin-console__content"><Routes>
        <Route path="/admin" element={<Navigate to="/admin/users" replace />} />
        <Route path="/admin/users" element={<AdminUsersSection />} />
        <Route path="/admin/credentials" element={<AdminCredentialsSection />} />
        <Route path="/admin/quotas" element={<AdminQuotasSection />} />
        <Route path="/admin/instance" element={<InstanceStatusPage />} />
        <Route path="*" element={<Navigate to="/admin/users" replace />} />
      </Routes></div>
    </section>
  </div>, document.body)
}

function SectionHeading({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: React.ReactNode }) {
  return <header className="admin-console__heading"><div><span>{eyebrow}</span><h2>{title}</h2><p>{description}</p></div>{action}</header>
}

function AdminUsersSection() {
  const [result, setResult] = useState<AdminUserPage | null>(null)
  const [q, setQ] = useState(''); const [role, setRole] = useState<AdminRole | ''>(''); const [state, setState] = useState<AdminUserState | ''>('')
  const [page, setPage] = useState(1); const [loading, setLoading] = useState(true); const [error, setError] = useState<string | null>(null)
  const [requests, setRequests] = useState<RegistrationRequest[]>([])
  const { confirm, confirmationDialog } = useConfirmDialog()
  const load = useCallback((signal?: AbortSignal) => {
    setLoading(true); setError(null)
    void Promise.all([getAdminUsers({ q: q.trim(), role, state, page }, signal), getRegistrationRequests(signal)])
      .then(([users, registrations]) => { if (!signal?.aborted) { setResult(users); setRequests(registrations) } })
      .catch((reason: unknown) => { if (!signal?.aborted) setError(reason instanceof Error ? reason.message : 'Chargement impossible.') })
      .finally(() => { if (!signal?.aborted) setLoading(false) })
  }, [page, q, role, state])
  useEffect(() => { const controller = new AbortController(); const timer = window.setTimeout(() => load(controller.signal), 250); return () => { controller.abort(); window.clearTimeout(timer) } }, [load])
  const change = async (item: AdminUser, payload: { role?: AdminRole; is_active?: boolean }, label: string) => {
    const accepted = await confirm({ title: label, message: `Confirmer cette modification pour ${item.display_name} ?`, confirmLabel: 'Confirmer' })
    if (!accepted) return
    try { await updateAdminUser(item.id, payload); load() } catch (reason) { setError(reason instanceof Error ? reason.message : 'Modification impossible.') }
  }
  const decide = async (item: RegistrationRequest, decision: 'approve' | 'reject') => {
    try { await reviewRegistration(item.id, decision); load() } catch (reason) { setError(reason instanceof Error ? reason.message : 'Décision impossible.') }
  }
  const pending = requests.filter((item) => item.status === 'pending')
  return <section>
    <SectionHeading eyebrow="Accès" title="Utilisateurs" description="Comptes, rôles et état d’accès à CartaVault." />
    <div className="admin-console__filters"><label>Recherche<input type="search" value={q} placeholder="Nom ou adresse email" onChange={(event) => { setQ(event.target.value); setPage(1) }} /></label><label>Rôle<select value={role} onChange={(event) => { setRole(event.target.value as AdminRole | ''); setPage(1) }}><option value="">Tous</option><option value="admin">Administrateurs</option><option value="user">Utilisateurs</option></select></label><label>État<select value={state} onChange={(event) => { setState(event.target.value as AdminUserState | ''); setPage(1) }}><option value="">Tous</option><option value="active">Actifs</option><option value="inactive">Inactifs</option><option value="deleted">Supprimés</option></select></label></div>
    {error && <div className="form-alert" role="alert">{error}</div>}
    {pending.length > 0 && <section className="admin-console__card"><h3>Demandes d’inscription <span>{pending.length}</span></h3><ul className="admin-console__rows">{pending.map((item) => <li key={item.id}><div><strong>{item.display_name}</strong><small>{item.email}</small></div><div className="admin-console__actions"><button aria-label={`Accepter ${item.email}`} onClick={() => void decide(item, 'approve')}><Check size={16} /></button><button className="danger" aria-label={`Refuser ${item.email}`} onClick={() => void decide(item, 'reject')}><X size={16} /></button></div></li>)}</ul></section>}
    <section className="admin-console__card"><h3>Comptes <span>{result?.total ?? 0}</span></h3>{loading ? <p role="status">Chargement…</p> : result?.items.length === 0 ? <p>Aucun utilisateur trouvé.</p> : <ul className="admin-console__user-grid">{result?.items.map((item) => <li key={item.id}>
      <div className="admin-console__avatar">{item.display_name.charAt(0).toUpperCase()}</div><div><strong>{item.display_name}</strong><small>{item.email}</small><p>{item.owned_map_count} carte(s) · {item.shared_map_count} partage(s) · dernière connexion {item.last_login_at ? new Date(item.last_login_at).toLocaleDateString('fr-FR') : 'jamais'}</p></div>
      <div className="admin-console__badges"><span className={item.role}>{item.role === 'admin' ? 'Administrateur' : 'Utilisateur'}</span><span className={item.state}>{item.state === 'active' ? 'Actif' : item.state === 'inactive' ? 'Inactif' : 'Supprimé'}</span></div>
      {item.state !== 'deleted' && <div className="admin-console__user-actions"><button onClick={() => void change(item, { role: item.role === 'admin' ? 'user' : 'admin' }, 'Modifier le rôle')}>{item.role === 'admin' ? 'Rétrograder' : 'Promouvoir'}</button><button className={item.state === 'active' ? 'danger' : ''} onClick={() => void change(item, { is_active: item.state !== 'active' }, item.state === 'active' ? 'Désactiver le compte' : 'Activer le compte')}>{item.state === 'active' ? 'Désactiver' : 'Activer'}</button></div>}
    </li>)}</ul>}
    {result && <footer className="admin-console__pagination"><button disabled={page <= 1} onClick={() => setPage((value) => value - 1)}><ChevronLeft size={16} />Précédent</button><span>Page {result.page} sur {result.pages}</span><button disabled={page >= result.pages} onClick={() => setPage((value) => value + 1)}>Suivant<ChevronRight size={16} /></button></footer>}</section>{confirmationDialog}
  </section>
}

function AdminCredentialsSection() {
  const [items, setItems] = useState<CredentialStatus[]>([]); const [value, setValue] = useState(''); const [error, setError] = useState<string | null>(null); const [busy, setBusy] = useState(false)
  const { confirm, confirmationDialog } = useConfirmDialog()
  const load = useCallback((signal?: AbortSignal) => {
    setError(null)
    void getAdminCredentials(signal)
      .then((result) => { if (!signal?.aborted) setItems(result) })
      .catch((reason: unknown) => { if (!signal?.aborted) setError(reason instanceof Error ? reason.message : 'Chargement impossible.') })
  }, [])
  useEffect(() => { const controller = new AbortController(); load(controller.signal); return () => controller.abort() }, [load])
  const resend = items.find((item) => item.provider === 'resend')
  const submit = async (event: FormEvent) => { event.preventDefault(); setBusy(true); setError(null); try { await saveResendCredential(value); setValue(''); load() } catch (reason) { setError(reason instanceof Error ? reason.message : 'Enregistrement impossible.') } finally { setBusy(false) } }
  const remove = async () => { if (!await confirm({ title: 'Supprimer la clé Resend', message: 'Les emails CartaVault ne pourront plus être envoyés.', confirmLabel: 'Supprimer' })) return; await deleteResendCredential(); load() }
  return <section><SectionHeading eyebrow="Intégrations" title="Clés API" description="Credentials globaux et état sécurisé des intégrations." />{error && <div className="form-alert" role="alert">{error}</div>}
    <div className="admin-console__credential-grid">{items.map((item) => <article className="admin-console__card" key={item.provider}><header><KeyRound size={19} /><div><h3>{item.label}</h3><p>{item.scope === 'personal' ? 'Clé personnelle, gérée dans le compte utilisateur.' : item.scope === 'infrastructure' ? 'Secret d’infrastructure en lecture seule.' : 'Clé globale de l’instance.'}</p></div><span className={item.configured ? 'ok' : 'warning'}>{item.configured ? 'Configuré' : 'Non configuré'}</span></header><dl><dt>Source</dt><dd>{sourceLabel(item.source)}</dd><dt>Valeur</dt><dd>{item.masked_value ?? 'Jamais exposée'}</dd>{item.configured_user_count !== null && <><dt>Utilisateurs configurés</dt><dd>{item.configured_user_count}</dd></>}<dt>Dernière vérification</dt><dd>{formatDate(item.verified_at)}</dd><dt>Dernière utilisation</dt><dd>{formatDate(item.last_used_at)}</dd><dt>Dernière erreur</dt><dd>{item.last_error_code ?? 'Aucune'}</dd></dl></article>)}</div>
    <section className="admin-console__card"><h3>Configuration Resend</h3><form className="admin-console__credential-form" onSubmit={submit}><label>Nouvelle clé API<input type="password" value={value} required autoComplete="off" placeholder="re_••••••••" onChange={(event) => setValue(event.target.value)} /></label><button className="primary-button" disabled={busy}><Save size={16} />{resend?.configured ? 'Remplacer' : 'Enregistrer'}</button>{resend?.configured && <><button type="button" onClick={() => void verifyResendCredential().then(() => load()).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Vérification impossible.'))}><RefreshCw size={16} />Vérifier</button><button className="danger" type="button" onClick={() => void remove()}><Trash2 size={16} />Supprimer</button></>}</form></section>{confirmationDialog}
  </section>
}

function AdminQuotasSection() {
  const [overview, setOverview] = useState<QuotaOverview | null>(null); const [draft, setDraft] = useState<QuotaLimits | null>(null); const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<UserQuota | null>(null); const [overrideDraft, setOverrideDraft] = useState<QuotaLimits | null>(null)
  const load = useCallback((signal?: AbortSignal) => {
    setError(null)
    void getAdminQuotas(signal)
      .then((result) => { if (!signal?.aborted) { setOverview(result); setDraft(result.global_limits) } })
      .catch((reason: unknown) => { if (!signal?.aborted) setError(reason instanceof Error ? reason.message : 'Chargement impossible.') })
  }, [])
  useEffect(() => { const controller = new AbortController(); load(controller.signal); return () => controller.abort() }, [load])
  const save = async (event: FormEvent) => { event.preventDefault(); if (!draft) return; try { await saveAdminQuotas(draft); load() } catch (reason) { setError(reason instanceof Error ? reason.message : 'Enregistrement impossible.') } }
  const saveOverride = async (event: FormEvent) => { event.preventDefault(); if (!editing || !overrideDraft) return; try { await saveUserQuota(editing.user_id, overrideDraft); setEditing(null); setOverrideDraft(null); load() } catch (reason) { setError(reason instanceof Error ? reason.message : 'Enregistrement impossible.') } }
  return <section><SectionHeading eyebrow="Capacité" title="Quotas et usages" description="Limites globales, usages observables et exceptions utilisateur." />{error && <div className="form-alert" role="alert">{error}</div>}{!overview || !draft ? <p role="status">Chargement…</p> : <>
    <section className="admin-console__card"><h3>Limites globales</h3><form className="admin-console__quota-form" onSubmit={save}>{quotaFields.map(([key, label, unit]) => <label key={key}>{label}<span><input type="number" min="1" value={draft[key] ?? ''} placeholder="Illimité" onChange={(event) => setDraft({ ...draft, [key]: event.target.value ? Number(event.target.value) : null })} />{unit}</span></label>)}<button className="primary-button"><Save size={16} />Enregistrer les limites</button></form><p className="admin-console__hint">Une limite vide signifie « illimité ». Aucun dépassement ne supprime automatiquement de données.</p></section>
    <section className="admin-console__metrics">{[['Cartes', overview.aggregate_usage.maps], ['Lieux', overview.aggregate_usage.places], ['Photos', overview.aggregate_usage.photos], ['Stockage photo', bytes(overview.aggregate_usage.photo_storage_bytes)]].map(([label, value]) => <article key={label}><span>{label}</span><strong>{value}</strong></article>)}</section>
    <section className="admin-console__card"><h3>Usages par utilisateur</h3><div className="admin-console__table-wrap"><table><thead><tr><th>Utilisateur</th><th>Cartes</th><th>Lieux</th><th>Photos</th><th>Stockage</th><th>Exception</th></tr></thead><tbody>{overview.users.map((item) => <tr key={item.user_id}><td><strong>{item.display_name}</strong><small>{item.email}</small></td><td>{item.usage.maps}{limitText(item.limits.maps)}</td><td>{item.usage.places}{limitText(item.limits.places)}</td><td>{item.usage.photos}</td><td>{bytes(item.usage.photo_storage_bytes)}{limitText(item.limits.photo_storage_bytes, true)}</td><td><button type="button" onClick={() => { setEditing(item); setOverrideDraft(item.overrides) }}>Configurer</button></td></tr>)}</tbody></table></div><p className="admin-console__hint">Non disponibles sans journal d’usage : {overview.unavailable_metrics.join(', ')}.</p></section>
    {editing && overrideDraft && <section className="admin-console__card admin-console__override" aria-labelledby="quota-override-title"><h3 id="quota-override-title">Exceptions pour {editing.display_name}</h3><p>Une valeur vide hérite de la limite globale.</p><form className="admin-console__quota-form" onSubmit={saveOverride}>{quotaFields.map(([key, label, unit]) => <label key={key}>{label}<span><input type="number" min="1" value={overrideDraft[key] ?? ''} placeholder="Limite globale" onChange={(event) => setOverrideDraft({ ...overrideDraft, [key]: event.target.value ? Number(event.target.value) : null })} />{unit}</span></label>)}<div className="admin-console__actions"><button className="primary-button" type="submit"><Save size={16} />Enregistrer</button><button type="button" onClick={() => { setEditing(null); setOverrideDraft(null) }}>Annuler</button></div></form></section>}
  </>}</section>
}

const quotaFields: [keyof QuotaLimits, string, string][] = [['maps', 'Cartes par utilisateur', ''], ['places', 'Lieux par utilisateur', ''], ['photo_storage_bytes', 'Stockage photo', 'octets'], ['photo_file_bytes', 'Taille maximale par fichier', 'octets'], ['members_per_map', 'Membres par carte', '']]
function sourceLabel(value: CredentialStatus['source']) { return ({ database: 'Base chiffrée', environment: 'Variable d’environnement', deployment: 'Secret de déploiement', none: 'Non configuré' })[value] }
function formatDate(value: string | null) { return value ? new Date(value).toLocaleString('fr-FR') : 'Jamais' }
function bytes(value: number | null) { if (value === null) return 'Indisponible'; if (value < 1024) return `${value} o`; if (value < 1024 ** 2) return `${(value / 1024).toFixed(1)} Kio`; if (value < 1024 ** 3) return `${(value / 1024 ** 2).toFixed(1)} Mio`; return `${(value / 1024 ** 3).toFixed(1)} Gio` }
function limitText(value: number | null, byteValue = false) { return value === null ? '' : ` / ${byteValue ? bytes(value) : value}` }
