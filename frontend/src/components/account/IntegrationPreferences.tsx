import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle, CheckCircle2, ChevronRight, Image as ImageIcon, KeyRound, MapPin, Route, Save, X } from 'lucide-react'

import { getPersonalApiKeys } from '../../api/account'
import { useI18n } from '../../i18n/useI18n'
import type { AccountPreferences, PersonalApiKey } from '../../types/account'

type ServiceKind = 'routing' | 'places' | 'classic-basemap' | 'satellite-basemap'

interface ServiceDraft {
  provider: string
  apiKeyId: string
}

const providerLabels: Record<string, string> = {
  osrm: 'OSRM',
  google: 'Google Routes',
  openrouteservice: 'OpenRouteService',
  stadia: 'Stadia Maps',
  osm: 'OpenStreetMap',
  mapbox: 'Mapbox',
}

function compatibleKeys(keys: PersonalApiKey[], kind: ServiceKind, provider: string) {
  if (kind === 'routing') return provider === 'google' ? keys.filter((key) => key.provider === 'google') : provider === 'openrouteservice' ? keys.filter((key) => key.provider === 'openrouteservice') : []
  return keys.filter((key) => key.provider === provider)
}

function keyLabel(keys: PersonalApiKey[], value: string | null | undefined, fallback: string) {
  const selected = keys.find((key) => key.id === value)
  return selected ? `${selected.name} · ••••${selected.last4}` : fallback
}

function ServiceState({ keys, value, optional = false }: { keys: PersonalApiKey[]; value: string | null | undefined; optional?: boolean }) {
  const { t } = useI18n()
  if (optional && !value) return <span className="account-integration-state is-neutral"><CheckCircle2 size={13} />{t('account.integrations.withoutKey')}</span>
  const selected = keys.find((key) => key.id === value)
  if (!selected) return <span className="account-integration-state is-warning"><AlertTriangle size={13} />{t('account.integrations.configure')}</span>
  if (selected.verified) return <span className="account-integration-state is-success"><CheckCircle2 size={13} />{t('account.integrations.verified')}</span>
  return <span className="account-integration-state is-warning"><AlertTriangle size={13} />{t('account.integrations.verify')}</span>
}

function ServiceRow({ icon: Icon, title, description, providerLabel, keyName, providerCaption, state, onEdit }: { icon: typeof Route; title: string; description: string; providerLabel: string; keyName: string; providerCaption: string; state: ReactNode; onEdit: () => void }) {
  const { t } = useI18n()
  return <article className="account-integration-row">
    <header><span><Icon size={18} /></span><div><h4>{title}</h4><p>{description}</p></div></header>
    <dl><div><dt>{providerCaption}</dt><dd>{providerLabel}</dd></div><div><dt>{t('account.integrations.associatedKey')}</dt><dd>{keyName}</dd></div></dl>
    <div className="account-integration-row__state">{state}</div>
    <button className="account-button account-button--secondary account-integration-row__edit" type="button" onClick={onEdit}>{t('account.integrations.edit')}<ChevronRight size={14} /></button>
  </article>
}

function ServiceDialog({ kind, initial, keys, stadiaKeyOptional, onClose, onSave }: { kind: ServiceKind; initial: ServiceDraft; keys: PersonalApiKey[]; stadiaKeyOptional: boolean; onClose: () => void; onSave: (draft: ServiceDraft) => void }) {
  const { t } = useI18n()
  const [draft, setDraft] = useState(initial)
  const title = kind === 'routing' ? t('account.integrations.configureRouting') : kind === 'places' ? t('account.integrations.configurePlaces') : kind === 'classic-basemap' ? t('account.integrations.configureClassicBasemap') : t('account.integrations.configureSatelliteBasemap')
  const DialogIcon = kind === 'routing' ? Route : kind === 'places' ? MapPin : ImageIcon
  const availableKeys = useMemo(() => compatibleKeys(keys, kind, draft.provider), [draft.provider, keys, kind])
  const keyDisabled = (kind === 'routing' && draft.provider === 'osrm') || (kind === 'classic-basemap' && draft.provider === 'osm') || (kind === 'satellite-basemap' && draft.provider === 'none')
  const keyOptional = keyDisabled || (kind.includes('basemap') && draft.provider === 'stadia' && stadiaKeyOptional)
  const changeProvider = (provider: string) => setDraft({ provider, apiKeyId: '' })

  return createPortal(<div className="account-integration-dialog-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <section className="account-integration-dialog" role="dialog" aria-modal="true" aria-labelledby="account-integration-dialog-title">
      <header>
        <span className="account-integration-dialog__icon"><DialogIcon size={19} aria-hidden="true" /></span>
        <div><p>{t('account.integrations.dialogEyebrow')}</p><h2 id="account-integration-dialog-title">{title}</h2><small>{t('account.integrations.dialogDescription')}</small></div>
        <button className="panel-icon-button" type="button" aria-label={t('account.integrations.close')} onClick={onClose}><X size={16} /></button>
      </header>
      <div className="account-integration-dialog__content">
        <label>{kind.includes('basemap') ? t('account.integrations.provider') : t('account.integrations.engine')}<select value={draft.provider} onChange={(event) => changeProvider(event.target.value)}>{kind === 'routing' ? <><option value="osrm">OSRM</option><option value="google">Google Routes</option><option value="openrouteservice">OpenRouteService</option></> : kind === 'places' ? <><option value="stadia">Stadia</option><option value="google">Google Places</option></> : kind === 'classic-basemap' ? <><option value="osm">OpenStreetMap standard</option><option value="stadia">Stadia light / dark</option><option value="google">Google normal</option></> : <><option value="none">{t('account.integrations.disabled')}</option><option value="stadia">Stadia Satellite</option><option value="google">Google Satellite</option><option value="mapbox">Mapbox Satellite</option></>}</select></label>
        <label>{t('account.integrations.associatedKey')} {keyOptional && <small>({t('account.integrations.optional')})</small>}<select value={draft.apiKeyId} disabled={keyDisabled} onChange={(event) => setDraft({ ...draft, apiKeyId: event.target.value })}><option value="">{keyOptional ? t('account.integrations.noKeyRequired') : t('account.integrations.selectKey')}</option>{availableKeys.map((key) => <option key={key.id} value={key.id}>{key.name} · ••••{key.last4}</option>)}</select></label>
        {!keyOptional && availableKeys.length === 0 && <p className="account-integration-dialog__warning"><AlertTriangle size={15} />{t('account.integrations.noCompatibleKey')}</p>}
      </div>
      <footer><button className="account-button account-button--secondary" type="button" onClick={onClose}>{t('account.integrations.cancel')}</button><button className="account-button account-button--primary" type="button" onClick={() => onSave(draft)}><Save size={14} />{t('account.integrations.save')}</button></footer>
    </section>
  </div>, document.body)
}

export function IntegrationPreferences({ preferences, setPreferences }: { preferences: AccountPreferences; setPreferences: (value: AccountPreferences) => void }) {
  const { t } = useI18n()
  const [keys, setKeys] = useState<PersonalApiKey[]>([])
  const [editing, setEditing] = useState<ServiceKind | null>(null)
  const stadiaKeyOptional = typeof window !== 'undefined' && ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname)
  useEffect(() => { void getPersonalApiKeys().then(setKeys).catch(() => setKeys([])) }, [])

  const basemaps = preferences.basemaps ?? { classic_provider: 'osm' as const, satellite_provider: 'none' as const }
  const classicProvider = basemaps.classic_provider ?? 'osm'
  const routingKeys = compatibleKeys(keys, 'routing', preferences.routing.provider)
  const placesKeys = compatibleKeys(keys, 'places', preferences.places.provider)
  const classicKeys = compatibleKeys(keys, 'classic-basemap', classicProvider)
  const satelliteKeys = compatibleKeys(keys, 'satellite-basemap', basemaps.satellite_provider)
  const providerKey = (provider: string) => provider === 'stadia' ? basemaps.stadia_api_key_id : provider === 'google' ? basemaps.google_api_key_id : provider === 'mapbox' ? basemaps.mapbox_api_key_id : null
  const initialDraft: ServiceDraft = editing === 'routing'
    ? { provider: preferences.routing.provider, apiKeyId: preferences.routing.api_key_id ?? '' }
    : editing === 'places'
      ? { provider: preferences.places.provider, apiKeyId: preferences.places.api_key_id ?? '' }
      : editing === 'classic-basemap' ? { provider: classicProvider, apiKeyId: providerKey(classicProvider) ?? '' } : { provider: basemaps.satellite_provider, apiKeyId: providerKey(basemaps.satellite_provider) ?? '' }

  const saveService = (draft: ServiceDraft) => {
    if (editing === 'routing') setPreferences({ ...preferences, routing: { provider: draft.provider as AccountPreferences['routing']['provider'], api_key_id: draft.provider === 'osrm' ? null : draft.apiKeyId || null } })
    if (editing === 'places') setPreferences({ ...preferences, places: { provider: draft.provider as AccountPreferences['places']['provider'], api_key_id: draft.apiKeyId || null } })
    if (editing === 'classic-basemap') { const provider = draft.provider as NonNullable<AccountPreferences['basemaps']>['classic_provider']; setPreferences({ ...preferences, preferred_basemap: provider === 'stadia' ? 'stadia-light' : provider === 'google' ? 'google-roadmap' : 'osm', basemaps: { ...basemaps, classic_provider: provider, ...(provider === 'stadia' ? { stadia_api_key_id: draft.apiKeyId || null } : provider === 'google' ? { google_api_key_id: draft.apiKeyId || null } : {}) } }) }
    if (editing === 'satellite-basemap') { const provider = draft.provider as NonNullable<AccountPreferences['basemaps']>['satellite_provider']; setPreferences({ ...preferences, basemaps: { ...basemaps, satellite_provider: provider, ...(provider === 'stadia' ? { stadia_api_key_id: draft.apiKeyId || null } : provider === 'google' ? { google_api_key_id: draft.apiKeyId || null } : provider === 'mapbox' ? { mapbox_api_key_id: draft.apiKeyId || null } : {}) } }) }
    setEditing(null)
  }

  return <>
    <section className="account-preference-card account-integration-preferences">
      <header className="account-integration-preferences__heading"><span><KeyRound size={19} aria-hidden="true" /></span><div><h3>{t('account.integrations.title')}</h3><p>{t('account.integrations.description')}</p></div></header>
      <div className="account-integration-preferences__list">
        <ServiceRow icon={Route} title={t('account.integrations.routing')} description={t('account.integrations.routingDescription')} providerLabel={providerLabels[preferences.routing.provider]} providerCaption={t('account.integrations.engine')} keyName={preferences.routing.provider === 'osrm' ? t('account.integrations.noKeyRequired') : keyLabel(routingKeys, preferences.routing.api_key_id, t('account.integrations.noKey'))} state={<ServiceState keys={routingKeys} value={preferences.routing.api_key_id} optional={preferences.routing.provider === 'osrm'} />} onEdit={() => setEditing('routing')} />
        <ServiceRow icon={MapPin} title={t('account.integrations.places')} description={t('account.integrations.placesDescription')} providerLabel={preferences.places.provider === 'google' ? 'Google Places' : 'Stadia'} providerCaption={t('account.integrations.engine')} keyName={keyLabel(placesKeys, preferences.places.api_key_id, t('account.integrations.noKey'))} state={<ServiceState keys={placesKeys} value={preferences.places.api_key_id} />} onEdit={() => setEditing('places')} />
        <ServiceRow icon={ImageIcon} title={t('account.integrations.classicBasemap')} description={t('account.integrations.classicBasemapDescription')} providerLabel={providerLabels[classicProvider]} providerCaption={t('account.integrations.provider')} keyName={classicProvider === 'osm' || (classicProvider === 'stadia' && stadiaKeyOptional && !providerKey('stadia')) ? t('account.integrations.noKeyRequired') : keyLabel(classicKeys, providerKey(classicProvider), t('account.integrations.noKey'))} state={<ServiceState keys={classicKeys} value={providerKey(classicProvider)} optional={classicProvider === 'osm' || (classicProvider === 'stadia' && stadiaKeyOptional)} />} onEdit={() => setEditing('classic-basemap')} />
        <ServiceRow icon={ImageIcon} title={t('account.integrations.satelliteBasemap')} description={t('account.integrations.satelliteBasemapDescription')} providerLabel={basemaps.satellite_provider === 'none' ? t('account.integrations.disabled') : providerLabels[basemaps.satellite_provider]} providerCaption={t('account.integrations.provider')} keyName={basemaps.satellite_provider === 'none' || (basemaps.satellite_provider === 'stadia' && stadiaKeyOptional && !providerKey('stadia')) ? t('account.integrations.noKeyRequired') : keyLabel(satelliteKeys, providerKey(basemaps.satellite_provider), t('account.integrations.noKey'))} state={<ServiceState keys={satelliteKeys} value={providerKey(basemaps.satellite_provider)} optional={basemaps.satellite_provider === 'none' || (basemaps.satellite_provider === 'stadia' && stadiaKeyOptional)} />} onEdit={() => setEditing('satellite-basemap')} />
      </div>
    </section>
    {editing && <ServiceDialog key={editing} kind={editing} initial={initialDraft} keys={keys} stadiaKeyOptional={stadiaKeyOptional} onClose={() => setEditing(null)} onSave={saveService} />}
  </>
}
