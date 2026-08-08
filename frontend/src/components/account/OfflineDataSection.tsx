import { Database, Download, HardDriveDownload, RefreshCw, Trash2, WifiOff } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'

import { useAuth } from '../../auth/useAuth'
import { useI18n } from '../../i18n/useI18n'
import { defaultMapOfflineOptions, defaultTripOfflineOptions, deleteOfflinePackage, downloadMapOfflinePackage, downloadTripOfflinePackage, getOfflineStorageEstimate, listOfflinePackages, requestPersistentOfflineStorage, type OfflinePackage } from '../../pwa/offlineData'

const formatBytes = (bytes: number | null) => bytes === null ? '—' : new Intl.NumberFormat(undefined, { style: 'unit', unit: 'megabyte', maximumFractionDigits: 1 }).format(bytes / 1024 / 1024)

export function OfflineDataSection() {
  const { user } = useAuth()
  const { t } = useI18n()
  const [packages, setPackages] = useState<OfflinePackage[]>([])
  const [storage, setStorage] = useState({ usage: null as number | null, quota: null as number | null })
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const refresh = useCallback(async () => {
    if (!user) return
    const [items, estimate] = await Promise.all([listOfflinePackages(user.id), getOfflineStorageEstimate()])
    setPackages(items); setStorage(estimate)
  }, [user])
  useEffect(() => { void refresh().catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Offline data unavailable.')) }, [refresh])
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
  return <><AccountOfflineHeading title={t('offline.title')} description={t('offline.description')} />
    <section className="account-preference-card account-offline-data">
      <p>{t('offline.explainer')}</p>
      {error && <p className="form-alert" role="alert">{error}</p>}
      <dl><div><dt><Database size={15} />{t('offline.used')}</dt><dd>{formatBytes(packages.reduce((total, item) => total + item.actualBytes, 0))}</dd></div><div><dt>{t('offline.availableStorage')}</dt><dd>{storage.quota === null ? t('offline.storageUnavailable') : `${formatBytes(storage.usage)} / ${formatBytes(storage.quota)}`}</dd></div></dl>
      <button className="account-button account-button--secondary" type="button" onClick={() => void requestPersistentOfflineStorage()}><HardDriveDownload size={15} />{t('offline.keep')}</button>
    </section>
    {packages.length === 0 ? <p className="account-info"><WifiOff size={17} />{t('offline.empty')}</p> : <ul className="account-sessions account-offline-packages">{packages.map((item) => <li key={item.id}><Download size={19} /><div><strong>{item.title}</strong><span>{item.kind === 'trip' ? 'Trip' : 'Map'} · {formatBytes(item.actualBytes)} · {new Date(item.lastSyncedAt).toLocaleDateString()}</span><b>{t('offline.available')}</b></div><div className="account-offline-packages__actions"><button className="panel-icon-button" type="button" disabled={busy !== null || !navigator.onLine} aria-label={`${t('offline.update')} ${item.title}`} title={t('offline.update')} onClick={() => void update(item)}><RefreshCw size={15} /></button><button className="panel-icon-button danger" type="button" disabled={busy !== null} aria-label={`${t('offline.delete')} ${item.title}`} title={t('offline.delete')} onClick={() => void remove(item)}><Trash2 size={15} /></button></div></li>)}</ul>}
  </>
}

function AccountOfflineHeading({ title, description }: { title: string; description: string }) { return <header className="account-content-heading"><p className="cv-workspace-panel__eyebrow">PWA</p><h2>{title}</h2><span>{description}</span></header> }
