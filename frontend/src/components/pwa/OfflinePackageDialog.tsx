import { CircleCheck, Download, HardDriveDownload, Info, Map, RefreshCw, Trash2, X } from 'lucide-react'
import { useEffect, useState } from 'react'

import { getCartaVaultVectorConfig, type CartaVaultVectorConfig } from '../../api/vectorBasemap'
import { useAuth } from '../../auth/useAuth'
import { useI18n } from '../../i18n/useI18n'
import { defaultMapOfflineOptions, defaultTripOfflineOptions, deleteOfflinePackage, getOfflinePackage, getOfflineStorageEstimate, type OfflineDownloadProgress, type OfflinePackage, type OfflinePackageOptions } from '../../pwa/offlineData'
import { startOfflineDownload } from '../../pwa/offlineDownloadManager'
import { getOfflinePackageInventory } from '../../pwa/offlinePackageInventory'
import { offlineDownloadPercent } from '../../pwa/offlineProgress'
import type { PoiMap } from '../../types/map'
import type { Trip } from '../../types/trip'

const formatBytes = (bytes: number) => new Intl.NumberFormat(undefined, { style: 'unit', unit: 'megabyte', maximumFractionDigits: 1 }).format(bytes / 1024 / 1024)

export function OfflinePackageDialog({ map, trip, onClose }: { map: PoiMap; trip?: Trip | null; onClose: () => void }) {
  const { user } = useAuth()
  const { t } = useI18n()
  const defaults = trip ? defaultTripOfflineOptions : defaultMapOfflineOptions
  const kind = trip ? 'trip' : 'map'
  const sourceId = trip?.id ?? map.id
  const [options, setOptions] = useState<OfflinePackageOptions>(() => ({ ...defaults, basemap: false }))
  const [existing, setExisting] = useState<OfflinePackage | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [storage, setStorage] = useState<{ usage: number | null; quota: number | null }>({ usage: null, quota: null })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState<OfflineDownloadProgress | null>(null)
  const [basemapConfig, setBasemapConfig] = useState<CartaVaultVectorConfig | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    void Promise.all([
      getOfflineStorageEstimate(),
      user?.id ? getOfflinePackage(user.id, kind, sourceId) : Promise.resolve(null),
      getCartaVaultVectorConfig(controller.signal, true, map.country.iso_alpha2, 'status').catch(() => null),
    ]).then(([estimate, saved, config]) => {
      if (controller.signal.aborted) return
      setStorage(estimate)
      setExisting(saved)
      setLoaded(true)
      setBasemapConfig(config)
      setOptions(saved
        ? { ...defaults, ...saved.included, basemap: Boolean(config?.available && saved.included.basemap) }
        : { ...defaults, basemap: config?.available === true })
    }).catch((reason) => {
      if (!controller.signal.aborted) {
        setLoaded(true)
        setError(reason instanceof Error ? reason.message : 'Stockage hors ligne indisponible.')
      }
    })
    return () => controller.abort()
  }, [kind, map.country.iso_alpha2, sourceId, user?.id])

  const toggle = (key: keyof OfflinePackageOptions) => setOptions((current) => ({ ...current, [key]: !current[key] }))
  const download = async () => {
    if (!user) return
    setBusy(true); setError(null)
    try {
      await startOfflineDownload({ userId: user.id, kind, sourceId, map, tripId: trip?.id, title: trip?.name ?? map.name, options }, setProgress)
      onClose()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Téléchargement hors ligne impossible.')
    } finally { setBusy(false) }
  }
  const remove = async () => {
    if (!existing || !window.confirm(t('offline.deleteConfirm', { name: existing.title }))) return
    setBusy(true); setError(null)
    try {
      await deleteOfflinePackage(existing.id)
      setExisting(null)
      setOptions({ ...defaults, basemap: basemapConfig?.available === true })
      setStorage(await getOfflineStorageEstimate())
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Suppression des données hors ligne impossible.')
    } finally { setBusy(false) }
  }

  const percent = progress ? offlineDownloadPercent(progress) : 0
  const basemapAvailable = basemapConfig?.available === true
  const basemapPreparing = basemapConfig ? ['downloading', 'generating', 'validating'].includes(basemapConfig.state) : false
  const basemapNotice = basemapPreparing ? t('offline.basemapPreparing') : !basemapAvailable ? t('offline.basemapUnavailable') : options.basemap ? t('offline.basemapIncluded') : t('offline.basemapExcluded')
  const inventory = existing ? getOfflinePackageInventory(existing) : null
  const inventoryItems = existing && inventory ? [
    existing.included.places ? t('offline.poiCount', { count: inventory.places }) : null,
    existing.included.organization ? t('offline.categoryCount', { count: inventory.categories }) : null,
    existing.included.organization ? t('offline.tagCount', { count: inventory.tags }) : null,
    existing.included.organization ? t('offline.statusCount', { count: inventory.statuses }) : null,
    existing.included.thumbnails ? t('offline.thumbnailCount', { count: inventory.thumbnails }) : null,
    existing.included.annotations ? t('offline.annotationCount', { count: inventory.annotations }) : null,
    existing.snapshot.trip ? t('offline.dayCount', { count: inventory.days }) : null,
    existing.snapshot.trip ? t('offline.stopCount', { count: inventory.stops }) : null,
    existing.snapshot.trip ? t('offline.nightCount', { count: inventory.nights }) : null,
    existing.snapshot.trip && existing.included.routeGeometry ? t('offline.routeCount', { count: inventory.routes }) : null,
    existing.basemap ? t('offline.tileCount', { count: inventory.tiles }) : null,
  ].filter((item): item is string => item !== null) : []

  return <div className="cv-overlay" role="presentation"><section className="cv-modal map-action-dialog offline-package-dialog" role="dialog" aria-modal="true" aria-labelledby="offline-package-title">
    <header className="map-action-dialog__header"><div><p className="cv-workspace-panel__eyebrow">PWA</p><h2 id="offline-package-title">{existing ? t('offline.manageTitle') : t('offline.downloadTitle')}</h2><span>{trip ? trip.name : map.name}</span></div><button className="panel-icon-button" type="button" aria-label={t('account.close')} onClick={onClose}><X size={18} /></button></header>
    <div className="map-action-dialog__body">
      {existing && <section className="offline-package-existing" aria-label={t('offline.cachedContent')}><header><CircleCheck size={20} aria-hidden /><div><strong>{t('offline.alreadyAvailable')}</strong><span>{t('offline.lastUpdated', { date: new Date(existing.lastSyncedAt).toLocaleString(), size: formatBytes(existing.actualBytes) })}</span></div></header><div>{inventoryItems.map((item) => <span key={item}>{item}</span>)}</div></section>}
      {loaded && !existing && <p className="offline-package-device-notice"><Info size={17} aria-hidden />{t('offline.notOnDevice')}</p>}
      <p>{t('offline.readOnly')}</p>
      <fieldset disabled={busy}><legend>{existing ? t('offline.updateContent') : t('offline.content')}</legend><label className="checkbox-field"><input type="checkbox" checked={options.places} onChange={() => toggle('places')} /><span>{t('offline.places')}</span></label><label className="checkbox-field"><input type="checkbox" checked={options.organization} onChange={() => toggle('organization')} /><span>{t('offline.organization')}</span></label>{trip && <><label className="checkbox-field"><input type="checkbox" checked={options.trip} onChange={() => toggle('trip')} /><span>{t('offline.trip')}</span></label><label className="checkbox-field"><input type="checkbox" checked={options.routeGeometry} onChange={() => toggle('routeGeometry')} /><span>{t('offline.routes')}</span></label></>}<label className="checkbox-field"><input type="checkbox" checked={options.thumbnails} onChange={() => toggle('thumbnails')} /><span>{t('offline.thumbnails')}</span></label><label className={`checkbox-field${basemapAvailable ? '' : ' is-disabled'}`}><input type="checkbox" checked={options.basemap} disabled={!basemapAvailable} onChange={() => toggle('basemap')} /><span>{t('offline.basemapOption')}</span></label></fieldset>
      <p className="map-action-dialog__notice"><HardDriveDownload size={16} />{storage.quota === null ? t(window.isSecureContext ? 'offline.storageUnavailable' : 'offline.insecureStorage') : `${Math.round((storage.usage ?? 0) / 1024 / 1024)} Mo / ${Math.round(storage.quota / 1024 / 1024)} Mo`}</p><p className="map-action-dialog__notice"><Map size={16} />{basemapNotice}</p>
      {progress && <div className="offline-package-progress"><div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}><i style={{ width: `${percent}%` }} /></div><span>{progress.phase === 'basemap' ? progress.reused && progress.bytes === 0 ? 'Réutilisation du fond CartaVault' : 'Fond CartaVault' : progress.phase === 'saving' ? 'Enregistrement' : 'Données'} · {percent}% · {Math.round(progress.bytes / 1024 / 1024)} Mo{progress.reused ? ` · ${progress.reused.toLocaleString('fr-FR')} tuiles réutilisées` : ''}</span></div>}
      {error && <p className="form-alert" role="alert">{error}</p>}
    </div>
    <footer className="map-action-dialog__footer dialog-actions">{existing && <button className="secondary-button danger" type="button" disabled={busy} onClick={() => void remove()}><Trash2 size={15} />{t('offline.delete')}</button>}<button className="secondary-button" type="button" disabled={busy} onClick={onClose}>{t('offline.cancel')}</button><button className="primary-button" type="button" disabled={busy || !user || !options.places} onClick={() => void download()}>{busy ? t('offline.preparing') : existing ? <><RefreshCw size={15} />{t('offline.update')}</> : <><Download size={15} />{t('offline.download')}</>}</button></footer>
  </section></div>
}
