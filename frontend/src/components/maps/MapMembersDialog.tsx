import { useCallback, useEffect, useRef, useState } from 'react'
import { Copy, Crown, MailPlus, Trash2, UserRound, X } from 'lucide-react'

import { createMapInvitation, getMapInvitations, getMapMembers, removeMapMember, revokeMapInvitation, transferMapOwnership, updateMapMember } from '../../api/maps'
import type { MapInvitation, MapMember, PoiMap } from '../../types/map'
import { useModalFocus } from '../../hooks/useModalFocus'

interface MapMembersDialogProps {
  poiMap: PoiMap
  onClose: () => void
  onMapUpdated: (map: PoiMap) => void
}

export function MapMembersDialog({ poiMap, onClose, onMapUpdated }: MapMembersDialogProps) {
  const dialog = useRef<HTMLElement>(null)
  const closeButton = useRef<HTMLButtonElement>(null)
  const [members, setMembers] = useState<MapMember[]>([])
  const [invitations, setInvitations] = useState<MapInvitation[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [lastLink, setLastLink] = useState<string | null>(null)
  useModalFocus({ dialogRef: dialog, initialFocusRef: closeButton, onEscape: onClose })

  const load = useCallback(() => {
    const controller = new AbortController()
    setLoading(true)
    setError(null)
    void Promise.all([getMapMembers(poiMap.id, controller.signal), getMapInvitations(poiMap.id, controller.signal)])
      .then(([loadedMembers, loadedInvitations]) => {
        setMembers(loadedMembers)
        setInvitations(loadedInvitations)
      })
      .catch((caught: unknown) => {
        if (!(caught instanceof Error && caught.name === 'AbortError')) setError(caught instanceof Error ? caught.message : 'Chargement impossible.')
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [poiMap.id])

  useEffect(() => load(), [load])

  const pendingInvitations = invitations.filter((item) => item.accepted_at === null && item.revoked_at === null)

  return <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <section ref={dialog} className="map-members-dialog" role="dialog" aria-modal="true" aria-labelledby="members-title">
      <header className="map-members-dialog__header">
        <div><p className="cv-workspace-panel__eyebrow">Partage privé</p><h2 id="members-title">Accès à {poiMap.name}</h2><span>Gérez les membres et invitez de nouveaux collaborateurs.</span></div>
        <button ref={closeButton} className="panel-icon-button" type="button" aria-label="Fermer" onClick={onClose}><X size={18} /></button>
      </header>
      <div className="map-members-dialog__body">
        {error && <div className="form-alert" role="alert">{error}</div>}
        <section className="map-members-section map-members-section--invite" aria-labelledby="invite-member-title">
          <div className="map-members-section__heading"><span className="map-members-section__icon"><MailPlus size={17} /></span><div><h3 id="invite-member-title">Inviter un membre</h3><p>Un lien d’accès sera généré pour cette adresse.</p></div></div>
          <InvitationForm onSubmit={async (email, role) => {
            setError(null)
            try {
              const invitation = await createMapInvitation(poiMap.id, email, role)
              setInvitations((current) => [invitation, ...current])
              setLastLink(`${window.location.origin}${invitation.invitation_url}`)
            } catch (caught) {
              setError(caught instanceof Error ? caught.message : 'Invitation impossible.')
            }
          }} />
          {lastLink && <div className="invitation-link"><input readOnly value={lastLink} aria-label="Lien d’invitation" /><button className="panel-icon-button" type="button" aria-label="Copier le lien" title="Copier le lien" onClick={() => void navigator.clipboard.writeText(lastLink)}><Copy size={15} /></button></div>}
        </section>

        {loading ? <p className="map-members-dialog__loading" role="status">Chargement…</p> : <>
          <section className="map-members-section" aria-labelledby="current-members-title">
            <div className="map-members-section__title"><h3 id="current-members-title">Membres</h3><span>{members.length}</span></div>
            <ul className="members-list">{members.map((membership) => <li key={membership.user.id}>
              <span className="member-avatar" aria-hidden="true"><UserRound size={16} /></span>
              <div className="member-summary"><strong>{membership.user.display_name}</strong><span>{membership.user.email}</span></div>
              {membership.role === 'owner' ? <b className="member-role-badge"><Crown size={13} />Propriétaire</b> : <div className="member-actions">
                <select aria-label={`Rôle de ${membership.user.display_name}`} value={membership.role} onChange={(event) => {
                  const role = event.target.value as 'editor' | 'viewer'
                  void updateMapMember(poiMap.id, membership.user.id, role).then((updated) => setMembers((current) => current.map((item) => item.user.id === updated.user.id ? updated : item))).catch((caught: unknown) => setError(caught instanceof Error ? caught.message : 'Modification impossible.'))
                }}><option value="editor">Éditeur</option><option value="viewer">Lecteur</option></select>
                {poiMap.can_transfer_ownership && <button className="panel-icon-button" type="button" aria-label={`Transférer à ${membership.user.display_name}`} title="Transférer la propriété" onClick={() => { if (window.confirm(`Transférer la propriété à ${membership.user.email} ?`)) void transferMapOwnership(poiMap.id, membership.user.id).then(onMapUpdated).then(onClose).catch((caught: unknown) => setError(caught instanceof Error ? caught.message : 'Transfert impossible.')) }}><Crown size={15} /></button>}
                <button className="panel-icon-button danger" type="button" aria-label={`Retirer ${membership.user.display_name}`} title="Retirer le membre" onClick={() => { if (window.confirm(`Retirer ${membership.user.email} de la carte ?`)) void removeMapMember(poiMap.id, membership.user.id).then(() => setMembers((current) => current.filter((item) => item.user.id !== membership.user.id))).catch((caught: unknown) => setError(caught instanceof Error ? caught.message : 'Retrait impossible.')) }}><Trash2 size={15} /></button>
              </div>}
            </li>)}</ul>
          </section>

          <section className="map-members-section" aria-labelledby="pending-invitations-title">
            <div className="map-members-section__title"><h3 id="pending-invitations-title">Invitations en attente</h3><span>{pendingInvitations.length}</span></div>
            {pendingInvitations.length === 0 ? <p className="map-members-empty">Aucune invitation en attente.</p> : <ul className="members-list invitation-list">{pendingInvitations.map((invitation) => <li key={invitation.id}>
              <span className="member-avatar pending" aria-hidden="true"><MailPlus size={16} /></span>
              <div className="member-summary"><strong>{invitation.email}</strong><span>{invitation.role === 'editor' ? 'Éditeur' : 'Lecteur'} · expire le {new Date(invitation.expires_at).toLocaleDateString('fr-FR')}</span></div>
              <button className="panel-icon-button danger" type="button" aria-label={`Révoquer l’invitation de ${invitation.email}`} title="Révoquer" onClick={() => void revokeMapInvitation(poiMap.id, invitation.id).then(() => setInvitations((current) => current.filter((item) => item.id !== invitation.id))).catch((caught: unknown) => setError(caught instanceof Error ? caught.message : 'Révocation impossible.'))}><X size={15} /></button>
            </li>)}</ul>}
          </section>
        </>}
      </div>
    </section>
  </div>
}

function InvitationForm({ onSubmit }: { onSubmit: (email: string, role: 'editor' | 'viewer') => Promise<void> }) {
  const [submitting, setSubmitting] = useState(false)
  return <form className="invitation-form" onSubmit={(event) => {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    setSubmitting(true)
    void onSubmit(String(data.get('email')), data.get('role') as 'editor' | 'viewer').finally(() => setSubmitting(false))
  }}>
    <label><span>Email</span><input name="email" type="email" placeholder="utilisateur@exemple.com" required /></label>
    <label><span>Rôle</span><select name="role" defaultValue="viewer"><option value="viewer">Lecteur</option><option value="editor">Éditeur</option></select></label>
    <button className="primary-button" type="submit" disabled={submitting}><MailPlus size={15} />{submitting ? 'Création…' : 'Inviter'}</button>
  </form>
}
