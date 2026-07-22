import { Check, Download, LockKeyhole, Map, Plus, Search, Settings2, Share2, Trash2, Users, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { acceptPendingMapInvitation, declinePendingMapInvitation, getPendingMapInvitations, updateMapPlaceFields } from '../../api/maps'
import { NOTIFICATIONS_CHANGED_EVENT, notifyNotificationsChanged } from '../notifications/events'
import type { PendingMapInvitation, PoiMap } from '../../types/map'
import { CreateMapDialog } from './CreateMapDialog'

interface MapsWorkspacePanelProps {
  maps: PoiMap[]
  activeMapId: string | null
  isLoading: boolean
  errorMessage: string | null
  onOpen: (mapId: string) => void
  onDelete: (poiMap: PoiMap) => void
  onCreated: (poiMap: PoiMap) => void
  onExport?: (poiMap: PoiMap) => void
  onMembers?: (poiMap: PoiMap) => void
  onAccessChanged?: () => void
  onClose: () => void
}

const normalize = (value: string) => value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase()

function CountryFlag({ countryCode }: { countryCode: string }) {
  const [failed, setFailed] = useState(false)
  const normalizedCode = countryCode.trim().toLowerCase()
  if (failed || !/^[a-z]{2}$/.test(normalizedCode)) return <Map className="maps-catalog__flag-fallback" size={30} aria-hidden="true" />
  return <img className="maps-catalog__flag" src={`https://flagcdn.com/${normalizedCode}.svg`} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} />
}

export function MapsWorkspacePanel({ maps, activeMapId, isLoading, errorMessage, onOpen, onDelete, onCreated, onExport = () => undefined, onMembers = () => undefined, onAccessChanged = () => undefined, onClose }: MapsWorkspacePanelProps) {
  const [creating, setCreating] = useState(false)
  const [query, setQuery] = useState('')
  const [invitations, setInvitations] = useState<PendingMapInvitation[]>([])
  const [invitationError, setInvitationError] = useState<string | null>(null)
  const [busyInvitationId, setBusyInvitationId] = useState<string | null>(null)
  const [settingsMap, setSettingsMap] = useState<PoiMap | null>(null)
  const createButton = useRef<HTMLButtonElement>(null)

  const loadInvitations = useCallback(() => {
    const controller = new AbortController()
    void getPendingMapInvitations(controller.signal).then((pending) => {
      setInvitations(pending)
      setInvitationError(null)
    }).catch((caught: unknown) => {
      if (!(caught instanceof Error && caught.name === 'AbortError')) {
        setInvitationError(caught instanceof Error ? caught.message : 'Impossible de charger les invitations.')
      }
    })
    return () => controller.abort()
  }, [])

  useEffect(() => {
    const abort = loadInvitations()
    const refresh = () => loadInvitations()
    window.addEventListener(NOTIFICATIONS_CHANGED_EVENT, refresh)
    return () => {
      abort()
      window.removeEventListener(NOTIFICATIONS_CHANGED_EVENT, refresh)
    }
  }, [loadInvitations])

  const search = normalize(query.trim())
  const filteredMaps = useMemo(() => search === '' ? maps : maps.filter((poiMap) => normalize(`${poiMap.name} ${poiMap.country.name}`).includes(search)), [maps, search])
  const filteredInvitations = useMemo(() => search === '' ? invitations : invitations.filter((invitation) => normalize(`${invitation.map_name} ${invitation.invited_by_display_name}`).includes(search)), [invitations, search])
  const totalCount = maps.length + invitations.length
  const closeCreateDialog = () => { setCreating(false); window.setTimeout(() => createButton.current?.focus(), 0) }

  const decideInvitation = async (invitation: PendingMapInvitation, decision: 'accept' | 'decline') => {
    if (busyInvitationId !== null) return
    setBusyInvitationId(invitation.id)
    setInvitationError(null)
    try {
      if (decision === 'accept') await acceptPendingMapInvitation(invitation.id)
      else await declinePendingMapInvitation(invitation.id)
      setInvitations((current) => current.filter((item) => item.id !== invitation.id))
      notifyNotificationsChanged()
      if (decision === 'accept') onAccessChanged()
    } catch (caught) {
      setInvitationError(caught instanceof Error ? caught.message : 'Impossible de traiter cette invitation.')
    } finally {
      setBusyInvitationId(null)
    }
  }

  return <aside id="workspace-maps-panel" className="country-place-panel workspace-management-panel cv-workspace-panel maps-workspace-panel" aria-labelledby="workspace-maps-title" tabIndex={-1}>
    <header className="cv-workspace-panel__header"><div className="cv-workspace-panel__heading"><p className="cv-workspace-panel__eyebrow">Cartographie</p><h2 id="workspace-maps-title" className="cv-workspace-panel__title">Cartes</h2></div><div className="cv-workspace-panel__header-actions"><span className="cv-workspace-panel__count">{totalCount} carte{totalCount > 1 ? 's' : ''}</span><button ref={createButton} className="panel-icon-button primary" type="button" aria-label="Créer une carte" title="Créer une carte" onClick={() => setCreating(true)}><Plus size={18} /></button><button className="panel-icon-button" type="button" aria-label="Fermer le panneau" title="Fermer" onClick={onClose}><X size={18} /></button></div></header>
    <div className="maps-workspace-panel__content">
      <label className="workspace-search-field"><Search aria-hidden="true" size={17} /><span className="visually-hidden">Rechercher une carte</span><input type="search" placeholder="Rechercher une carte" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
      {(errorMessage || invitationError) && <p className="form-alert" role="alert">{errorMessage ?? invitationError}</p>}
      {isLoading && <p className="maps-panel-state" role="status">Chargement des cartes…</p>}
      {!isLoading && totalCount === 0 && <div className="maps-panel-empty"><p>Aucune carte créée.</p><button type="button" className="primary-button" onClick={() => setCreating(true)}>Créer une carte</button></div>}
      {!isLoading && totalCount > 0 && filteredMaps.length === 0 && filteredInvitations.length === 0 && <p className="place-list-message">Aucune carte ne correspond à la recherche.</p>}
      <ul className="maps-catalog" aria-label="Cartes disponibles">
        {filteredInvitations.map((invitation) => <li className="maps-catalog__invitation" key={`invitation-${invitation.id}`}>
          <div className="maps-catalog__preview" aria-label={`Aperçu indisponible de ${invitation.map_name}`} role="img"><Map size={28} /><span>INV</span></div>
          <div className="maps-catalog__details"><span className="maps-catalog__privacy shared" aria-label="Invitation de partage" title="Invitation de partage"><Share2 size={15} /></span><strong>{invitation.map_name}</strong><span>Partagée par {invitation.invited_by_display_name}</span><em>{invitation.role === 'editor' ? 'Accès éditeur' : 'Accès lecteur'}</em><b>Invitation en attente</b></div>
          <div className="maps-catalog__actions maps-catalog__invitation-actions"><button type="button" className="secondary-button" disabled={busyInvitationId !== null} onClick={() => void decideInvitation(invitation, 'decline')}>Refuser</button><button type="button" className="primary-button" disabled={busyInvitationId !== null} onClick={() => void decideInvitation(invitation, 'accept')}><Check size={14} />Accepter</button></div>
        </li>)}
        {filteredMaps.map((poiMap) => <li className={poiMap.id === activeMapId ? 'active' : ''} key={poiMap.id}>
          <div className="maps-catalog__preview" aria-label={`Drapeau ${poiMap.country.name}, aperçu de ${poiMap.name}`} role="img"><CountryFlag countryCode={poiMap.country.iso_alpha2} /><span className="maps-catalog__country-code">{poiMap.country.iso_alpha2}</span></div>
          <div className="maps-catalog__details"><span className={`maps-catalog__privacy${poiMap.is_shared ? ' shared' : ''}`} aria-label={poiMap.is_shared ? 'Carte partagée' : 'Carte privée'} title={poiMap.is_shared ? 'Carte partagée' : 'Carte privée'}>{poiMap.is_shared ? <Share2 size={15} /> : <LockKeyhole size={15} />}</span><strong>{poiMap.name}</strong><span>{poiMap.country.name}</span><em>{poiMap.current_user_role === 'owner' ? 'Propriétaire' : poiMap.current_user_role === 'editor' ? 'Éditeur' : poiMap.current_user_role === 'viewer' ? 'Lecteur' : 'Administrateur'}</em>{poiMap.id === activeMapId && <b>Ouverte</b>}</div>
          <div className="maps-catalog__actions"><button type="button" className="secondary-button" aria-label={`Ouvrir ${poiMap.name}`} disabled={poiMap.id === activeMapId} onClick={() => onOpen(poiMap.id)}>Ouvrir</button>{poiMap.can_edit && <button type="button" className="panel-icon-button" aria-label={`Configurer les champs de ${poiMap.name}`} title="Champs des POI" onClick={() => setSettingsMap(poiMap)}><Settings2 size={16} /></button>}{poiMap.can_export !== false && <button type="button" className="panel-icon-button" aria-label={`Exporter la carte ${poiMap.name}`} title={`Exporter ${poiMap.name}`} onClick={() => onExport(poiMap)}><Download size={16} /></button>}{poiMap.can_manage_members && <button type="button" className="panel-icon-button" aria-label={`Gérer les membres de ${poiMap.name}`} title="Membres" onClick={() => onMembers(poiMap)}><Users size={16} /></button>}{poiMap.can_delete !== false && <button type="button" className="panel-icon-button danger" aria-label={`Supprimer ${poiMap.name}`} title={`Supprimer ${poiMap.name}`} onClick={() => onDelete(poiMap)}><Trash2 size={16} /></button>}</div>
        </li>)}
      </ul>
    </div>
    {creating && <CreateMapDialog onClose={closeCreateDialog} onCreated={(poiMap) => { closeCreateDialog(); onCreated(poiMap) }} />}
    {settingsMap && <PlaceFieldSettingsDialog poiMap={settingsMap} onClose={() => setSettingsMap(null)} onSaved={onAccessChanged} />}
  </aside>
}

const FIELD_LABELS: Record<string, string> = { description: 'Description', region: 'Région', construction_date: 'Date de construction', abandonment_date: 'Date d’abandon', condition: 'État de conservation', access: 'Accès', danger_level: 'Niveau de danger', links: 'Liens externes', ratings: 'Notations', favorite: 'Favori' }

function PlaceFieldSettingsDialog({ poiMap, onClose, onSaved }: { poiMap: PoiMap; onClose: () => void; onSaved: () => void }) {
  const [fields, setFields] = useState<Record<string, boolean>>(() => Object.fromEntries(Object.keys(FIELD_LABELS).map((key) => [key, poiMap.place_field_config?.[key] !== false])))
  const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null)
  const save = async () => { try { setBusy(true); setError(null); await updateMapPlaceFields(poiMap.id, fields); onSaved(); onClose() } catch (caught) { setError(caught instanceof Error ? caught.message : 'Configuration impossible.') } finally { setBusy(false) } }
  return <div className="cv-overlay" role="presentation"><section className="cv-modal map-place-fields-dialog" role="dialog" aria-modal="true" aria-labelledby="map-place-fields-title"><header><div><p className="cv-workspace-panel__eyebrow">Paramètres de la carte</p><h2 id="map-place-fields-title">Champs des POI</h2></div><button className="panel-icon-button" type="button" aria-label="Fermer" onClick={onClose}><X size={18} /></button></header><p>Désactiver un champ le masque sans supprimer les valeurs existantes.</p>{error && <p className="form-alert" role="alert">{error}</p>}<div className="map-place-fields-grid">{Object.entries(FIELD_LABELS).map(([key, label]) => <label key={key}><input type="checkbox" checked={fields[key] !== false} onChange={(event) => setFields((current) => ({ ...current, [key]: event.target.checked }))} />{label}</label>)}</div><footer className="dialog-actions"><button className="secondary-button" type="button" onClick={onClose}>Annuler</button><button className="primary-button" type="button" disabled={busy} onClick={() => void save()}>{busy ? 'Enregistrement…' : 'Enregistrer'}</button></footer></section></div>
}
