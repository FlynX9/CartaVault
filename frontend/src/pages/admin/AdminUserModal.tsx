import { CheckCircle2, Clock3, Mail, ShieldCheck, Users, X } from 'lucide-react'
import { createPortal } from 'react-dom'

import type { AdminUserActivity, AdminUserDetails } from '../../types/adminConsole'

const activityLabels: Record<string, string> = {
  role_changed: 'Rôle modifié',
  account_state_changed: 'État du compte modifié',
  quota_profile_changed: 'Profil de quota modifié',
  account_created: 'Compte créé',
  totp_enabled: 'Authentification MFA activée',
  totp_disabled: 'Authentification MFA désactivée',
  email_mfa_enabled: 'Code par e-mail activé',
  email_mfa_disabled: 'Code par e-mail désactivé',
  recovery_codes_regenerated: 'Codes de récupération régénérés',
  totp_login_succeeded: 'Connexion réussie',
  email_mfa_login_succeeded: 'Connexion réussie',
}

export function AdminUserModal({ detail, activityUser, activity, loading, onClose }: {
  detail: AdminUserDetails | null
  activityUser: { display_name: string } | null
  activity: AdminUserActivity[]
  loading: boolean
  onClose: () => void
}) {
  const title = detail ? `Fiche de ${detail.display_name}` : activityUser ? `Historique de ${activityUser.display_name}` : 'Chargement…'
  return createPortal(<div className="cv-overlay admin-user-modal-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <section className="cv-modal admin-user-modal" role="dialog" aria-modal="true" aria-labelledby="admin-user-modal-title">
      <header><div><p className="cv-workspace-panel__eyebrow">UTILISATEUR</p><h2 id="admin-user-modal-title">{title}</h2></div><button className="panel-icon-button" type="button" aria-label="Fermer" onClick={onClose}><X size={16} /></button></header>
      {loading ? <p className="admin-user-modal__loading">Chargement…</p> : detail ? <div className="admin-user-detail">
        <section><h3>Identité et accès</h3><dl><dt>Adresse e-mail</dt><dd><Mail size={14} />{detail.email}</dd><dt>Rôle</dt><dd>{detail.role === 'admin' ? 'Administrateur' : 'Utilisateur'}</dd><dt>Compte</dt><dd>{detail.state === 'active' ? 'Actif' : detail.state === 'inactive' ? 'Suspendu' : 'Supprimé'}</dd><dt>Créé le</dt><dd>{new Date(detail.created_at).toLocaleDateString('fr-FR')}</dd><dt>Dernière connexion</dt><dd>{detail.last_login_at ? new Date(detail.last_login_at).toLocaleString('fr-FR') : 'Jamais'}</dd></dl></section>
        <section><h3>Sécurité et capacité</h3><dl><dt>E-mail</dt><dd><CheckCircle2 size={14} />{detail.email_verified ? 'Vérifié' : 'Non vérifié'}</dd><dt>Authentification MFA</dt><dd><ShieldCheck size={14} />{detail.mfa_enabled ? 'Activée' : 'Non activée'}</dd><dt>Sessions actives</dt><dd><Users size={14} />{detail.active_session_count}</dd><dt>Profil de quota</dt><dd>{detail.quota_profile_name}</dd></dl></section>
        <section className="admin-user-detail__counts"><h3>Utilisation</h3><div><span>{detail.owned_map_count}<small>cartes</small></span><span>{detail.shared_map_count}<small>participations</small></span><span>{detail.place_count}<small>POI</small></span><span>{detail.trip_count}<small>sorties</small></span></div></section>
      </div> : <div className="admin-user-activity"><p>Les 100 événements les plus récents sont conservés pour ce compte.</p>{activity.length === 0 ? <p className="admin-user-modal__empty">Aucun événement enregistré pour le moment.</p> : <ol>{activity.map((event) => <li key={event.id}><Clock3 size={15} /><div><strong>{activityLabels[event.event_type] ?? event.event_type}</strong>{event.previous_value !== null && <span>{event.previous_value} → {event.next_value}</span>}<small>{new Date(event.occurred_at).toLocaleString('fr-FR')}{event.actor_display_name ? ` · par ${event.actor_display_name}` : ''}</small></div></li>)}</ol>}</div>}
    </section>
  </div>, document.body)
}
