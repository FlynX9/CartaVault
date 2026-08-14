import { Download, HardDriveDownload, Map, X } from 'lucide-react'
import { useEffect, useState } from 'react'

import { useAuth } from '../../auth/useAuth'
import { useI18n } from '../../i18n/useI18n'
import { defaultMapOfflineOptions, defaultTripOfflineOptions, downloadMapOfflinePackage, downloadTripOfflinePackage, getOfflineStorageEstimate, requestPersistentOfflineStorage, type OfflineDownloadProgress, type OfflinePackageOptions } from '../../pwa/offlineData'
import type { PoiMap } from '../../types/map'
import type { Trip } from '../../types/trip'

export function OfflinePackageDialog({ map, trip, onClose }: { map: PoiMap; trip?: Trip | null; onClose: () => void }) {
  const { user } = useAuth()
  const { t } = useI18n()
  const [options, setOptions] = useState<OfflinePackageOptions>(trip ? defaultTripOfflineOptions : defaultMapOfflineOptions)
  const [storage, setStorage] = useState<{ usage: number | null; quota: number | null }>({ usage: null, quota: null })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState<OfflineDownloadProgress | null>(null)
  useEffect(() => { void getOfflineStorageEstimate().then(setStorage) }, [])
  const toggle = (key: keyof OfflinePackageOptions) => setOptions((current) => ({ ...current, [key]: !current[key] }))
  const download = async () => {
    if (!user) return
    setBusy(true); setError(null)
    try {
      await requestPersistentOfflineStorage()
      if (trip) await downloadTripOfflinePackage(user.id, map, trip.id, options, undefined, setProgress)
      else await downloadMapOfflinePackage(user.id, map, options, undefined, setProgress)
      onClose()
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Téléchargement hors ligne impossible.') } finally { setBusy(false) }
  }
  const percent = progress?.total ? Math.round(progress.completed * 100 / progress.total) : 0
  return <div className="cv-overlay" role="presentation"><section className="cv-modal map-action-dialog offline-package-dialog" role="dialog" aria-modal="true" aria-labelledby="offline-package-title"><header className="map-action-dialog__header"><div><p className="cv-workspace-panel__eyebrow">PWA</p><h2 id="offline-package-title">{t('offline.downloadTitle')}</h2><span>{trip ? trip.name : map.name}</span></div><button className="panel-icon-button" type="button" aria-label={t('account.close')} onClick={onClose}><X size={18} /></button></header><div className="map-action-dialog__body"><p>{t('offline.readOnly')}</p><fieldset disabled={busy}><legend>{t('offline.content')}</legend><label className="checkbox-field"><input type="checkbox" checked={options.places} onChange={() => toggle('places')} /><span>{t('offline.places')}</span></label><label className="checkbox-field"><input type="checkbox" checked={options.organization} onChange={() => toggle('organization')} /><span>{t('offline.organization')}</span></label>{trip && <><label className="checkbox-field"><input type="checkbox" checked={options.trip} onChange={() => toggle('trip')} /><span>{t('offline.trip')}</span></label><label className="checkbox-field"><input type="checkbox" checked={options.routeGeometry} onChange={() => toggle('routeGeometry')} /><span>{t('offline.routes')}</span></label></>}<label className="checkbox-field"><input type="checkbox" checked={options.thumbnails} onChange={() => toggle('thumbnails')} /><span>{t('offline.thumbnails')}</span></label></fieldset><p className="map-action-dialog__notice"><HardDriveDownload size={16} />{storage.quota === null ? t('offline.storageUnavailable') : `${Math.round((storage.usage ?? 0) / 1024 / 1024)} Mo / ${Math.round(storage.quota / 1024 / 1024)} Mo`}</p><p className="map-action-dialog__notice"><Map size={16} />{t('offline.basemap')}</p>{progress && <div className="offline-package-progress"><div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}><i style={{ width: `${percent}%` }} /></div><span>{progress.phase === 'basemap' ? 'Fond CartaVault' : progress.phase === 'saving' ? 'Enregistrement' : 'Données'} · {percent}% · {Math.round(progress.bytes / 1024 / 1024)} Mo</span></div>}{error && <p className="form-alert" role="alert">{error}</p>}</div><footer className="map-action-dialog__footer dialog-actions"><button className="secondary-button" type="button" disabled={busy} onClick={onClose}>{t('offline.cancel')}</button><button className="primary-button" type="button" disabled={busy || !user || !options.places} onClick={() => void download()}>{busy ? t('offline.preparing') : <><Download size={15} />{t('offline.download')}</>}</button></footer></section></div>
}
