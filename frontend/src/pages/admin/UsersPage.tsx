import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { KeyRound, Pencil, Plus, ShieldCheck, UserRoundCheck, UserRoundX } from 'lucide-react'

import { createUser, getUsers, resetUserPassword, updateUser, type AdminUser, type UpdateUserPayload } from '../../api/users'
import { WorkspaceSearchField } from '../../components/admin/WorkspaceSearchField'
import { WorkspacePanelHeader } from '../../components/layout/WorkspacePanelHeader'

export function UsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([])
  const [query, setQuery] = useState('')
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<AdminUser | null>(null)
  const [resetting, setResetting] = useState<AdminUser | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(() => {
    const controller = new AbortController()
    setLoading(true); setError(null)
    void getUsers(query.trim() || undefined, controller.signal)
      .then(setUsers)
      .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : 'Impossible de charger les utilisateurs.'))
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [query])

  useEffect(() => {
    const timeout = window.setTimeout(load, 250)
    return () => window.clearTimeout(timeout)
  }, [load])

  const saveUser = async (user: AdminUser, payload: UpdateUserPayload) => {
    setError(null); setSuccess(null)
    try {
      const updated = await updateUser(user.id, payload)
      setUsers((current) => current.map((item) => item.id === updated.id ? updated : item))
      setEditing(null)
      setSuccess(`${updated.display_name} a bien été modifié.`)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Modification impossible.')
    }
  }

  const createAction = <button className="panel-icon-button primary" type="button" aria-label="Créer un utilisateur" title="Créer un utilisateur" onClick={() => { setCreating(true); setEditing(null); setResetting(null) }}><Plus size={18} /></button>

  return <section className="admin-page cv-management-panel cv-users-panel" aria-labelledby="users-title">
    <WorkspacePanelHeader eyebrow="Administration" title="Utilisateurs" titleId="users-title" count={`${users.length} utilisateur${users.length > 1 ? 's' : ''}`} action={createAction} />
    <WorkspaceSearchField value={query} onChange={setQuery} placeholder="Rechercher un utilisateur" />
    {error && <div className="form-alert cv-panel-message" role="alert">{error}</div>}
    {success && <p className="admin-success cv-panel-message" role="status">{success}</p>}
    {creating && <CreateUserForm onCancel={() => setCreating(false)} onCreated={(user) => { setUsers((current) => [...current, user]); setCreating(false); setSuccess(`${user.display_name} a bien été créé.`) }} onError={setError} />}
    {editing && <EditUserForm user={editing} onCancel={() => setEditing(null)} onSubmit={(payload) => void saveUser(editing, payload)} />}
    {resetting && <ResetPasswordForm user={resetting} onCancel={() => setResetting(null)} onDone={() => { setResetting(null); setSuccess(`Le mot de passe de ${resetting.display_name} a été réinitialisé.`) }} onError={setError} />}
    {loading
      ? <p className="cv-panel-state" role="status">Chargement…</p>
      : users.length === 0
        ? <p className="admin-empty cv-panel-state">Aucun utilisateur trouvé.</p>
        : <ul className="admin-entity-list cv-panel-users-list cv-workspace-panel__list">{users.map((user) => <UserCard key={user.id} user={user} onEdit={() => { setEditing(user); setCreating(false); setResetting(null) }} onReset={() => { setResetting(user); setCreating(false); setEditing(null) }} />)}</ul>}
  </section>
}

function UserCard({ user, onEdit, onReset }: { user: AdminUser; onEdit: () => void; onReset: () => void }) {
  const initials = user.display_name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'CV'
  return <li className="cv-user-card cv-workspace-panel__card">
    <span className="cv-user-card__avatar" aria-hidden="true">{initials}</span>
    <div className="entity-summary cv-user-card__summary"><strong>{user.display_name}</strong><p>{user.email}</p><div className="cv-user-card__badges">{user.is_admin && <span className="admin"><ShieldCheck size={12} />Admin</span>}<span className={user.is_active ? 'active' : 'inactive'}>{user.is_active ? <UserRoundCheck size={12} /> : <UserRoundX size={12} />}{user.is_active ? 'Actif' : 'Inactif'}</span></div></div>
    <div className="entity-actions"><button className="panel-icon-button" type="button" aria-label={`Modifier ${user.display_name}`} title="Modifier" onClick={onEdit}><Pencil size={16} /></button><button className="panel-icon-button" type="button" aria-label={`Réinitialiser le mot de passe de ${user.display_name}`} title="Réinitialiser le mot de passe" onClick={onReset}><KeyRound size={16} /></button></div>
  </li>
}

function CreateUserForm({ onCancel, onCreated, onError }: { onCancel: () => void; onCreated: (user: AdminUser) => void; onError: (message: string | null) => void }) {
  const [submitting, setSubmitting] = useState(false)
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const data = new FormData(event.currentTarget); setSubmitting(true); onError(null)
    void createUser({ email: String(data.get('email')), display_name: String(data.get('display_name')), password: String(data.get('password')), is_admin: data.get('is_admin') === 'on', is_active: true }).then(onCreated).catch((caught: unknown) => onError(caught instanceof Error ? caught.message : 'Création impossible.')).finally(() => setSubmitting(false))
  }
  return <form className="admin-form cv-workspace-panel__form" onSubmit={submit}><h3>Nouvel utilisateur</h3><label className="form-field"><span>Adresse email *</span><input name="email" type="email" required autoComplete="email" /></label><label className="form-field"><span>Nom affiché *</span><input name="display_name" required maxLength={120} /></label><label className="form-field"><span>Mot de passe *</span><input name="password" type="password" required minLength={12} autoComplete="new-password" /></label><label className="checkbox-field"><input name="is_admin" type="checkbox" /><span>Administrateur global</span></label><div className="admin-form-actions"><button type="submit" className="primary-button" disabled={submitting}>{submitting ? 'Création…' : 'Créer'}</button><button type="button" className="secondary-button" onClick={onCancel}>Annuler</button></div></form>
}

function EditUserForm({ user, onCancel, onSubmit }: { user: AdminUser; onCancel: () => void; onSubmit: (payload: UpdateUserPayload) => void }) {
  const [name, setName] = useState(user.display_name)
  const [isAdmin, setIsAdmin] = useState(user.is_admin)
  const [isActive, setIsActive] = useState(user.is_active)
  return <form className="admin-form cv-workspace-panel__form" onSubmit={(event) => { event.preventDefault(); onSubmit({ display_name: name.trim(), is_admin: isAdmin, is_active: isActive }) }}><h3>Modifier {user.display_name}</h3><label className="form-field"><span>Nom affiché *</span><input required maxLength={120} value={name} onChange={(event) => setName(event.target.value)} /></label><div className="cv-user-flags"><label className="checkbox-field"><input type="checkbox" checked={isAdmin} onChange={(event) => setIsAdmin(event.target.checked)} /><span>Administrateur</span></label><label className="checkbox-field"><input type="checkbox" checked={isActive} onChange={(event) => setIsActive(event.target.checked)} /><span>Compte actif</span></label></div><div className="admin-form-actions"><button type="submit" className="primary-button">Enregistrer</button><button type="button" className="secondary-button" onClick={onCancel}>Annuler</button></div></form>
}

function ResetPasswordForm({ user, onCancel, onDone, onError }: { user: AdminUser; onCancel: () => void; onDone: () => void; onError: (message: string | null) => void }) {
  const [submitting, setSubmitting] = useState(false)
  return <form className="admin-form cv-workspace-panel__form" onSubmit={(event) => { event.preventDefault(); const password = String(new FormData(event.currentTarget).get('password')); setSubmitting(true); onError(null); void resetUserPassword(user.id, password).then(onDone).catch((caught: unknown) => onError(caught instanceof Error ? caught.message : 'Réinitialisation impossible.')).finally(() => setSubmitting(false)) }}><h3>Mot de passe de {user.display_name}</h3><label className="form-field"><span>Nouveau mot de passe *</span><input name="password" type="password" required minLength={12} autoComplete="new-password" /></label><div className="admin-form-actions"><button type="submit" className="primary-button" disabled={submitting}>{submitting ? 'Réinitialisation…' : 'Réinitialiser'}</button><button type="button" className="secondary-button" onClick={onCancel}>Annuler</button></div></form>
}
