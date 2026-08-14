import { ChartPie, CloudDownload, CloudOff, Database, Info, Map as MapIcon, RefreshCw, Route, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState, type ComponentType } from 'react'

import { useAuth } from '../../auth/useAuth'
import { useI18n } from '../../i18n/useI18n'
import { defaultMapOfflineOptions, defaultTripOfflineOptions, deleteOfflinePackage, downloadMapOfflinePackage, downloadTripOfflinePackage, getOfflineStorageEstimate, listOfflinePackages, type OfflinePackage } from '../../pwa/offlineData'
import { getCartaVaultVectorConfig } from '../../api/vectorBasemap'

const formatBytes = (bytes: number | null) => bytes === null ? '—' : new Intl.NumberFormat(undefined, { style: 'unit', unit: 'megabyte', maximumFractionDigits: 1 }).format(bytes / 1024 / 1024)

export function OfflineDataSection() {
  const { user } = useAuth()
  const { t } = useI18n()
  const [packages, setPackages] = useState<OfflinePackage[]>([])
  const [storage, setStorage] = useState({ usage: null as number | null, quota: null as number | null })
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [basemapVersion, setBasemapVersion] = useState<string | null>(null)
  const refresh = useCallback(async () => {
    if (!user) return
    const [items, estimate] = await Promise.all([listOfflinePackages(user.id), getOfflineStorageEstimate()])
    setPackages(items)
    setStorage(estimate)
  }, [user])
  useEffect(() => { void refresh().catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Offline data unavailable.')); void getCartaVaultVectorConfig().then((config) => setBasemapVersion(config.available ? config.version : null)).catch(() => undefined) }, [refresh])
  const metrics = useMemo(() => {
    const maps = packages.filter((item) => item.kind === 'map').length
    const trips = packages.filter((item) => item.kind === 'trip').length
    const used = packages.reduce((total, item) => total + item.actualBytes, 0)
    const available = storage.quota === null ? null : Math.max(0, storage.quota - (storage.usage ?? 0))
    const percent = storage.quota && storage.quota > 0 ? Math.min(100, Math.round((used / storage.quota) * 100)) : 0
    return { maps, trips, used, available, percent }
  }, [packages, storage])
  if (!user) return null
  const update = async (item: OfflinePackage) => {
    setBusy(item.id); setError(null)
    try {
      if (item.kind === 'trip') await downloadTripOfflinePackage(user.id, item.snapshot.map, item.sourceId, item.included ?? defaultTripOfflineOptions)
      else await downloadMapOfflinePackage(user.id, item.snapshot.map, item.included ?? defaultMapOfflineOptions)
      await refresh()
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to update offline data.') } finally { setBusy(null) }
  }
  const remove = async (item: OfflinePackage) => {
    if (!window.confirm(t('offline.deleteConfirm', { name: item.title }))) return
    setBusy(item.id); setError(null)
    try { await deleteOfflinePackage(item.id); await refresh() } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to delete offline data.') } finally { setBusy(null) }
  }
  return <>
    <AccountOfflineHeading title={t('offline.title')} description={t('offline.description')} />
    <section className="account-offline-summary" aria-label={t('offline.summary')}>
      <OfflineMetric icon={MapIcon} label={t('offline.mapsAvailable')} value={metrics.maps} />
      <OfflineMetric icon={Route} label={t('offline.tripsAvailable')} value={metrics.trips} />
      <OfflineMetric icon={ChartPie} label={t('offline.spaceUsed')} value={formatBytes(metrics.used)} />
      <OfflineMetric icon={Database} label={t('offline.availableStorage')} value={metrics.available === null ? t('offline.storageUnavailable') : formatBytes(metrics.available)} />
    </section>
    <section className="account-offline-management">
      <header><span><CloudDownload size={21} aria-hidden="true" /></span><div><h3>{t('offline.management')}</h3><p>{t('offline.explainer')}</p></div></header>
      {error && <p className="form-alert" role="alert">{error}</p>}
      <div className="account-offline-storage">
        <header><strong>{t('offline.storage')}</strong><b>{metrics.percent}%</b></header>
        <div className="account-offline-storage__track" role="progressbar" aria-label={t('offline.spaceUsed')} aria-valuemin={0} aria-valuemax={100} aria-valuenow={metrics.percent}><i style={{ width: `${metrics.percent}%` }} /></div>
        <p>{t('offline.usedOf', { used: formatBytes(metrics.used), total: storage.quota === null ? t('offline.storageUnavailable') : formatBytes(storage.quota) })}</p>
        <div className="account-offline-storage__counts"><span><MapIcon size={17} /><small>{t('offline.mapsDownloaded')}</small><strong>{metrics.maps}</strong></span><span><Route size={17} /><small>{t('offline.tripsDownloaded')}</small><strong>{metrics.trips}</strong></span></div>
      </div>
    </section>
    {packages.length === 0 ? <section className="account-offline-empty"><span><CloudOff size={32} aria-hidden="true" /></span><div><h3>{t('offline.emptyTitle')}</h3><p>{t('offline.emptyDescription')}</p></div></section> : <ul className="account-sessions account-offline-packages">{packages.map((item) => { const Icon = item.kind === 'trip' ? Route : MapIcon; const basemap = item.basemap ? ` · CartaVault ${item.basemap.version} · z${item.basemap.minZoom}–${item.basemap.maxZoom}` : ''; const updateAvailable = Boolean(item.basemap && basemapVersion && item.basemap.version !== basemapVersion); return <li key={item.id}><Icon size={19} /><div><strong>{item.title}</strong><span>{item.kind === 'trip' ? t('offline.tripKind') : t('offline.mapKind')} · {formatBytes(item.actualBytes)} · {new Date(item.lastSyncedAt).toLocaleDateString()}{basemap}</span><b>{updateAvailable ? t('offline.update') : t('offline.available')}</b></div><div className="account-offline-packages__actions"><button className="panel-icon-button" type="button" disabled={busy !== null || !navigator.onLine} aria-label={`${t('offline.update')} ${item.title}`} title={t('offline.update')} onClick={() => void update(item)}><RefreshCw size={15} /></button><button className="panel-icon-button danger" type="button" disabled={busy !== null} aria-label={`${t('offline.delete')} ${item.title}`} title={t('offline.delete')} onClick={() => void remove(item)}><Trash2 size={15} /></button></div></li> })}</ul>}
    <aside className="account-offline-tip"><Info size={20} /><p>{t('offline.tip')}</p></aside>
  </>
}

function OfflineMetric({ icon: Icon, label, value }: { icon: ComponentType<{ size?: number; 'aria-hidden'?: boolean }>; label: string; value: string | number }) {
  return <article><span><Icon size={20} aria-hidden /></span><strong>{label}</strong><b>{value}</b></article>
}

function AccountOfflineHeading({ title, description }: { title: string; description: string }) { return <header className="account-content-heading"><p className="cv-workspace-panel__eyebrow">PWA</p><h2>{title}</h2><span>{description}</span></header> }
