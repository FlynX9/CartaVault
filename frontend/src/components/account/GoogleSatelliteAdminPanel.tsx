import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { KeyRound, RefreshCw, Save } from 'lucide-react'

import { getGoogleSatelliteAdminStatus, resetGoogleSatelliteErrors, saveGoogleSatelliteSettings, type GoogleSatelliteAdminStatus } from '../../api/googleSatellite'

/** Instance-wide Google Map Tiles safeguards, available to administrators from their API keys. */
export function GoogleSatelliteAdminPanel() {
  const [status, setStatus] = useState<GoogleSatelliteAdminStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const load = useCallback((signal?: AbortSignal) => {
    void getGoogleSatelliteAdminStatus(signal).then(setStatus).catch((reason) => {
      if (!signal?.aborted) setError(reason instanceof Error ? reason.message : 'Chargement Google Satellite impossible.')
    })
  }, [])
  useEffect(() => { const controller = new AbortController(); load(controller.signal); return () => controller.abort() }, [load])
  const run = async (action: () => Promise<GoogleSatelliteAdminStatus>) => {
    setBusy(true); setError(null)
    try { setStatus(await action()) } catch (reason) { setError(reason instanceof Error ? reason.message : 'Opération impossible.') } finally { setBusy(false) }
  }
  const saveSettings = (event: FormEvent) => { event.preventDefault(); if (status) void run(() => saveGoogleSatelliteSettings(status.settings)) }
  return <section className="account-credential" aria-labelledby="google-satellite-settings-title">
    <div className="account-credential__heading"><span className="account-credential__icon"><KeyRound size={18} /></span><div><h3 id="google-satellite-settings-title">Google Satellite</h3><p>Garde-fous partagés de Google Map Tiles pour cette instance.</p></div><span className="account-credential__status">{status?.available ? 'Actif' : 'Inactif'}</span></div>
    {error && <div className="form-alert" role="alert">{error}</div>}
    {status && <><dl className="account-credential__metrics"><div><dt>Tuiles aujourd’hui</dt><dd>{status.usage.tiles_started_today.toLocaleString('fr-FR')}</dd></div><div><dt>Tuiles ce mois</dt><dd>{status.usage.tiles_started_month.toLocaleString('fr-FR')}</dd></div><div><dt>Échecs aujourd’hui</dt><dd>{status.usage.tiles_failed_today.toLocaleString('fr-FR')}</dd></div></dl>
      <form className="account-credential__form" onSubmit={saveSettings}><label className="account-credential__check"><span>Activer Google Satellite</span><input type="checkbox" checked={status.settings.enabled} onChange={(event) => setStatus({ ...status, settings: { ...status.settings, enabled: event.target.checked } })} /></label><label>Seuil journalier<input type="number" min="100" value={status.settings.daily_soft_limit} onChange={(event) => setStatus({ ...status, settings: { ...status.settings, daily_soft_limit: Number(event.target.value) } })} /></label><label>Seuil mensuel<input type="number" min="100" value={status.settings.monthly_soft_limit} onChange={(event) => setStatus({ ...status, settings: { ...status.settings, monthly_soft_limit: Number(event.target.value) } })} /></label><label>Désactivation à (%)<input type="number" min="50" max="200" value={status.settings.auto_disable_percent} onChange={(event) => setStatus({ ...status, settings: { ...status.settings, auto_disable_percent: Number(event.target.value) } })} /></label><div className="account-credential__actions"><button className="account-button account-button--primary" disabled={busy}><Save size={16} />Enregistrer les garde-fous</button><button className="account-button account-button--secondary" type="button" disabled={busy} onClick={() => void run(resetGoogleSatelliteErrors)}><RefreshCw size={16} />Réinitialiser les erreurs</button></div></form>
      <p className="account-credential__hint">Les métriques locales n’incluent ni URL, ni jeton, ni coordonnées. <a href={status.authoritative_monitoring.console_url} target="_blank" rel="noreferrer">Ouvrir les métriques Google Cloud</a> pour la facturation autoritative.</p></>}
  </section>
}
