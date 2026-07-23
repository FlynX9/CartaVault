import { Check, Download, LockKeyhole, Map, Plus, Search, Settings2, Share2, Trash2, Users, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { acceptPendingMapInvitation, declinePendingMapInvitation, getPendingMapInvitations, updateMapPlaceFields } from '../../api/maps'
import { NOTIFICATIONS_CHANGED_EVENT, notifyNotificationsChanged } from '../notifications/events'
import { useI18n } from '../../i18n/useI18n'
import type { PendingMapInvitation, PoiMap } from '../../types/map'
import { CountryFlag } from './CountryFlag'
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

export function MapsWorkspacePanel({ maps, activeMapId, isLoading, errorMessage, onOpen, onDelete, onCreated, onExport = () => undefined, onMembers = () => undefined, onAccessChanged = () => undefined, onClose }: MapsWorkspacePanelProps) {
  const { t } = useI18n()
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
        setInvitationError(caught instanceof Error ? caught.message : t('maps.invitation.loadError'))
      }
    })
    return () => controller.abort()
  }, [t])

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
      setInvitationError(caught instanceof Error ? caught.message : t('maps.invitation.actionError'))
    } finally {
      setBusyInvitationId(null)
    }
  }

  return <aside id="workspace-maps-panel" className="country-place-panel workspace-management-panel cv-workspace-panel maps-workspace-panel" aria-labelledby="workspace-maps-title" tabIndex={-1}>
    <header className="cv-workspace-panel__header"><div className="cv-workspace-panel__heading"><p className="cv-workspace-panel__eyebrow">{t('maps.eyebrow')}</p><h2 id="workspace-maps-title" className="cv-workspace-panel__title">{t('maps.title')}</h2></div><div className="cv-workspace-panel__header-actions"><span className="cv-workspace-panel__count">{t('maps.count', { count: totalCount })}</span><button ref={createButton} className="panel-icon-button primary panel-create-action" type="button" aria-label={t('maps.create')} title={t('maps.new')} onClick={() => setCreating(true)}><Plus size={18} aria-hidden="true" /><span className="panel-create-action__label">{t('maps.new')}</span></button><button className="panel-icon-button" type="button" aria-label={t('maps.closePanel')} title={t('common.close')} onClick={onClose}><X size={18} /></button></div></header>
    <div className="maps-workspace-panel__content">
      <label className="workspace-search-field"><Search aria-hidden="true" size={17} /><span className="visually-hidden">{t('maps.search')}</span><input type="search" placeholder={t('maps.search')} value={query} onChange={(event) => setQuery(event.target.value)} /></label>
      {(errorMessage || invitationError) && <p className="form-alert" role="alert">{errorMessage ?? invitationError}</p>}
      {isLoading && <p className="maps-panel-state" role="status">{t('maps.loading')}</p>}
      {!isLoading && totalCount === 0 && <div className="maps-panel-empty"><p>{t('maps.empty')}</p><button type="button" className="primary-button" onClick={() => setCreating(true)}>{t('maps.create')}</button></div>}
      {!isLoading && totalCount > 0 && filteredMaps.length === 0 && filteredInvitations.length === 0 && <p className="place-list-message">{t('maps.noResult')}</p>}
      <ul className="maps-catalog" aria-label={t('maps.available')}>
        {filteredInvitations.map((invitation) => <li className="maps-catalog__invitation" key={`invitation-${invitation.id}`}>
          <div className="maps-catalog__preview" aria-label={t('maps.invitation.preview', { name: invitation.map_name })} role="img"><Map size={28} /><span>INV</span></div>
          <div className="maps-catalog__details"><span className="maps-catalog__privacy shared" aria-label={t('maps.invitation.shared')} title={t('maps.invitation.shared')}><Share2 size={15} /></span><strong>{invitation.map_name}</strong><span>{t('maps.invitation.by', { name: invitation.invited_by_display_name })}</span><em>{invitation.role === 'editor' ? t('maps.invitation.editor') : t('maps.invitation.viewer')}</em><b>{t('maps.invitation.pending')}</b></div>
          <div className="maps-catalog__actions maps-catalog__invitation-actions"><button type="button" className="secondary-button" disabled={busyInvitationId !== null} onClick={() => void decideInvitation(invitation, 'decline')}>{t('maps.invitation.decline')}</button><button type="button" className="primary-button" disabled={busyInvitationId !== null} onClick={() => void decideInvitation(invitation, 'accept')}><Check size={14} />{t('maps.invitation.accept')}</button></div>
        </li>)}
        {filteredMaps.map((poiMap) => <li className={poiMap.id === activeMapId ? 'active' : ''} key={poiMap.id}>
          <div className="maps-catalog__summary">
            <div className="maps-catalog__preview" aria-label={t('maps.flagPreview', { country: poiMap.country.name, name: poiMap.name })} role="img"><CountryFlag countryCode={poiMap.country.iso_alpha2} className="maps-catalog__flag" /></div>
            <div className="maps-catalog__details"><span className={`maps-catalog__privacy${poiMap.is_shared ? ' shared' : ''}`} aria-label={poiMap.is_shared ? t('maps.shared') : t('maps.private')} title={poiMap.is_shared ? t('maps.shared') : t('maps.private')}>{poiMap.is_shared ? <Share2 size={15} /> : <LockKeyhole size={15} />}</span><strong>{poiMap.name}</strong><span>{poiMap.country.name}</span><em>{t(`maps.role.${poiMap.current_user_role === 'owner' || poiMap.current_user_role === 'editor' || poiMap.current_user_role === 'viewer' ? poiMap.current_user_role : 'admin'}`)}</em></div>
          </div>
          <div className="maps-catalog__actions"><button type="button" className="secondary-button" aria-label={t(poiMap.id === activeMapId ? 'maps.openedNamed' : 'maps.openNamed', { name: poiMap.name })} disabled={poiMap.id === activeMapId} onClick={() => onOpen(poiMap.id)}>{t(poiMap.id === activeMapId ? 'maps.opened' : 'maps.open')}</button>{poiMap.can_edit && <button type="button" className="panel-icon-button" aria-label={t('maps.configureFields', { name: poiMap.name })} title={t('maps.fields')} onClick={() => setSettingsMap(poiMap)}><Settings2 size={16} /></button>}{poiMap.can_export !== false && <button type="button" className="panel-icon-button" aria-label={t('maps.export', { name: poiMap.name })} title={t('maps.export', { name: poiMap.name })} onClick={() => onExport(poiMap)}><Download size={16} /></button>}{poiMap.can_manage_members && <button type="button" className="panel-icon-button" aria-label={t('maps.manageMembers', { name: poiMap.name })} title={t('maps.members')} onClick={() => onMembers(poiMap)}><Users size={16} /></button>}{poiMap.can_delete !== false && <button type="button" className="panel-icon-button danger" aria-label={t('maps.deleteNamed', { name: poiMap.name })} title={t('maps.deleteNamed', { name: poiMap.name })} onClick={() => onDelete(poiMap)}><Trash2 size={16} /></button>}</div>
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
  return <div className="cv-overlay" role="presentation"><section className="cv-modal map-action-dialog map-place-fields-dialog" role="dialog" aria-modal="true" aria-labelledby="map-place-fields-title"><header className="map-action-dialog__header"><div><p className="cv-workspace-panel__eyebrow">Paramètres de la carte</p><h2 id="map-place-fields-title">Champs des POI</h2><span>Choisissez les informations visibles sur les fiches de cette carte.</span></div><button className="panel-icon-button" type="button" aria-label="Fermer" onClick={onClose}><X size={18} /></button></header><div className="map-action-dialog__body"><p className="map-action-dialog__notice">Les valeurs existantes sont conservées lorsqu’un champ est masqué.</p>{error && <p className="form-alert" role="alert">{error}</p>}<div className="map-place-fields-grid">{Object.entries(FIELD_LABELS).map(([key, label]) => <label key={key}><span>{label}</span><input type="checkbox" checked={fields[key] !== false} onChange={(event) => setFields((current) => ({ ...current, [key]: event.target.checked }))} /></label>)}</div></div><footer className="map-action-dialog__footer dialog-actions"><button className="secondary-button" type="button" onClick={onClose}>Annuler</button><button className="primary-button" type="button" disabled={busy} onClick={() => void save()}>{busy ? 'Enregistrement…' : 'Enregistrer'}</button></footer></section></div>
}
