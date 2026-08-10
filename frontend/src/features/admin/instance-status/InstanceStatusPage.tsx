import { useCallback, useEffect, useState } from 'react'
import {
  AlertTriangle, Archive, CheckCircle2, Clock3, Copy, Cpu, Database, FileText,
  HardDrive, Mail, Map, MemoryStick, RefreshCw, Route, Server, ShieldCheck,
  Users, XCircle,
} from 'lucide-react'

import { getInstanceHealth, getInstanceLogs, refreshInstanceHealth } from '../../../api/adminConsole'
import type {
  DiagnosticBase, InstanceHealth, InstanceLogEntry, InstanceLogLevel, InstanceStatusValue, SecurityCheck,
} from '../../../types/adminConsole'
import { useI18n } from '../../../i18n/useI18n'

type InstanceView = 'overview' | 'resources' | 'logs' | 'diagnostics'

const text = {
  fr: {
    eyebrow: 'Supervision', title: 'État de l’instance', subtitle: 'Santé, ressources, journaux et diagnostics opérationnels de CartaVault.',
    refresh: 'Actualiser', loading: 'Diagnostic en cours…', overview: 'Vue d’ensemble', resources: 'Ressources', logs: 'Journaux', diagnostics: 'Diagnostics',
    global: 'État global', version: 'Version', uptime: 'Disponibilité', storage: 'Stockage média', sinceStart: 'depuis le dernier démarrage', free: 'libres',
    services: 'Services', servicesHint: 'Contrôles légers et bornés, mis en cache.', usage: 'Usage', usageHint: 'Volumes agrégés, sans donnée personnelle.',
    alerts: 'Alertes opérationnelles', noAlerts: 'Aucune alerte opérationnelle.', runtime: 'Runtime CartaVault', cpu: 'Processeur', memory: 'Mémoire', workers: 'Workers', unavailable: 'Indisponible',
    database: 'Base de données', media: 'Médias', appDisk: 'Volume média local', used: 'utilisés', total: 'capacité', scope: 'Mesure',
    filterLevel: 'Tous les niveaux', filterComponent: 'Tous les composants', search: 'Rechercher dans les journaux…', newest: 'Plus récents', oldest: 'Plus anciens',
    autoRefresh: 'Actualisation automatique', loadMore: 'Charger plus', emptyLogs: 'Aucun journal ne correspond aux filtres.', copied: 'Entrée copiée', retained: 'entrées conservées en mémoire par processus',
    security: 'Sécurité', maintenance: 'Maintenance', backups: 'Sauvegardes', controlledErrors: 'Erreurs contrôlées récentes', noErrors: 'Aucune erreur contrôlée détectée.',
    checked: 'Vérifié le', stale: 'Les données affichées peuvent être anciennes.', configured: 'Configuré', unknown: 'Inconnu', active: 'actifs', shared: 'partagées', pending: 'en attente',
    environment: 'Environnement', started: 'Démarré le', expiredSessions: 'Sessions expirées', expiredTokens: 'Jetons expirés', temporaryExports: 'Exports temporaires',
  },
  en: {
    eyebrow: 'Monitoring', title: 'Instance status', subtitle: 'CartaVault health, resources, application logs and operational diagnostics.',
    refresh: 'Refresh', loading: 'Running diagnostics…', overview: 'Overview', resources: 'Resources', logs: 'Logs', diagnostics: 'Diagnostics',
    global: 'Overall status', version: 'Version', uptime: 'Uptime', storage: 'Media storage', sinceStart: 'since last start', free: 'free',
    services: 'Services', servicesHint: 'Lightweight bounded checks with short caching.', usage: 'Usage', usageHint: 'Aggregated volumes without personal data.',
    alerts: 'Operational alerts', noAlerts: 'No operational alert.', runtime: 'CartaVault runtime', cpu: 'CPU', memory: 'Memory', workers: 'Workers', unavailable: 'Unavailable',
    database: 'Database', media: 'Media', appDisk: 'Local media volume', used: 'used', total: 'capacity', scope: 'Scope',
    filterLevel: 'All levels', filterComponent: 'All components', search: 'Search application logs…', newest: 'Newest first', oldest: 'Oldest first',
    autoRefresh: 'Auto refresh', loadMore: 'Load more', emptyLogs: 'No log entry matches the filters.', copied: 'Entry copied', retained: 'entries retained in memory per process',
    security: 'Security', maintenance: 'Maintenance', backups: 'Backups', controlledErrors: 'Recent controlled errors', noErrors: 'No controlled error detected.',
    checked: 'Checked at', stale: 'Displayed data may be stale.', configured: 'Configured', unknown: 'Unknown', active: 'active', shared: 'shared', pending: 'pending',
    environment: 'Environment', started: 'Started at', expiredSessions: 'Expired sessions', expiredTokens: 'Expired tokens', temporaryExports: 'Temporary exports',
  },
} as const

const statusText = {
  fr: { operational: 'Opérationnel', degraded: 'Dégradé', unavailable: 'Indisponible', misconfigured: 'Mal configuré', unknown: 'Inconnu' },
  en: { operational: 'Healthy', degraded: 'Degraded', unavailable: 'Unavailable', misconfigured: 'Misconfigured', unknown: 'Unknown' },
} satisfies Record<'fr' | 'en', Record<InstanceStatusValue, string>>

const securityLabels: Record<'fr' | 'en', Record<string, string>> = {
  fr: {
    'security.https_enabled': 'HTTPS actif en production', 'security.secure_cookie': 'Cookies de session sécurisés', 'security.csrf_enabled': 'Protection CSRF active',
    'security.debug_disabled': 'Mode debug désactivé', 'security.credential_encryption': 'Chiffrement des identifiants configuré', 'security.email_configured': 'Service email configuré',
    'security.backup_known': 'Sauvegardes documentées', 'security.mfa_admins': 'MFA des administrateurs', 'security.public_registration': 'Politique d’inscription publique',
  },
  en: {
    'security.https_enabled': 'HTTPS enabled in production', 'security.secure_cookie': 'Secure session cookies', 'security.csrf_enabled': 'CSRF protection enabled',
    'security.debug_disabled': 'Debug mode disabled', 'security.credential_encryption': 'Credential encryption configured', 'security.email_configured': 'Email service configured',
    'security.backup_known': 'Backups documented', 'security.mfa_admins': 'Administrator MFA', 'security.public_registration': 'Public registration policy',
  },
}

const logComponents = ['ADMIN', 'API', 'AUTH', 'DATABASE', 'EMAIL', 'EXPORT', 'IMPORT', 'MEDIA', 'ROUTING', 'WORKER']

const alertCopy: Record<'fr' | 'en', Record<string, { message: string; action: string }>> = {
  fr: {
    STORAGE_USAGE_HIGH: { message: 'Le stockage persistant approche de sa capacité.', action: 'Libérez de l’espace ou augmentez la capacité du volume.' },
    MEMORY_USAGE_HIGH: { message: 'La mémoire du runtime approche de sa limite.', action: 'Vérifiez les tâches actives et la limite mémoire du conteneur.' },
    DATABASE_UNAVAILABLE: { message: 'PostgreSQL ne répond pas.', action: 'Vérifiez le service PostgreSQL et sa connectivité.' },
    MIGRATION_MISMATCH: { message: 'La base ne correspond pas aux migrations attendues.', action: 'Exécutez les migrations CartaVault avant de poursuivre.' },
    MEDIA_STORAGE_UNAVAILABLE: { message: 'Le stockage des médias est indisponible.', action: 'Vérifiez le montage et les permissions du volume média.' },
  },
  en: {
    STORAGE_USAGE_HIGH: { message: 'Persistent storage is approaching capacity.', action: 'Free some space or increase the volume capacity.' },
    MEMORY_USAGE_HIGH: { message: 'Runtime memory is approaching its limit.', action: 'Check active tasks and the container memory limit.' },
    DATABASE_UNAVAILABLE: { message: 'PostgreSQL is not responding.', action: 'Check the PostgreSQL service and connectivity.' },
    MIGRATION_MISMATCH: { message: 'The database does not match the expected migrations.', action: 'Run CartaVault migrations before continuing.' },
    MEDIA_STORAGE_UNAVAILABLE: { message: 'Media storage is unavailable.', action: 'Check the media volume mount and permissions.' },
  },
}

function formatBytes(value: number | null, locale: string) {
  if (value === null) return locale === 'fr' ? 'Non mesuré' : 'Not measured'
  return new Intl.NumberFormat(locale, { style: 'unit', unit: value >= 1024 ** 3 ? 'gigabyte' : value >= 1024 ** 2 ? 'megabyte' : 'kilobyte', maximumFractionDigits: 1 }).format(value / (value >= 1024 ** 3 ? 1024 ** 3 : value >= 1024 ** 2 ? 1024 ** 2 : 1024))
}

function formatResourceScope(scope: string, language: 'fr' | 'en') {
  const labels: Record<'fr' | 'en', Record<string, string>> = {
    fr: { 'host-system': 'système hôte', 'container-cgroup': 'conteneur', unavailable: 'indisponible' },
    en: { 'host-system': 'host system', 'container-cgroup': 'container', unavailable: 'unavailable' },
  }
  return labels[language][scope] ?? scope
}

function duration(seconds: number, language: 'fr' | 'en') {
  const days = Math.floor(seconds / 86400); const hours = Math.floor((seconds % 86400) / 3600); const minutes = Math.floor((seconds % 3600) / 60)
  return [days ? `${days} ${language === 'fr' ? 'j' : 'd'}` : '', hours ? `${hours} h` : '', `${minutes} min`].filter(Boolean).join(' ')
}

function StatusBadge({ status, language }: { status: InstanceStatusValue; language: 'fr' | 'en' }) {
  const Icon = status === 'operational' ? CheckCircle2 : status === 'unavailable' || status === 'misconfigured' ? XCircle : AlertTriangle
  return <span className={`instance-status__badge instance-status__badge--${status}`}><Icon size={13} aria-hidden="true" />{statusText[language][status]}</span>
}

function ServiceRow({ icon: Icon, name, item, detail, language }: { icon: typeof Server; name: string; item: DiagnosticBase; detail: string; language: 'fr' | 'en' }) {
  return <li><span className="instance-status__service-icon"><Icon size={17} aria-hidden="true" /></span><div><strong>{name}</strong><small>{detail}</small></div><StatusBadge status={item.status} language={language} /></li>
}

function Meter({ label, value, detail, percent, icon: Icon }: { label: string; value: string; detail: string; percent: number | null; icon: typeof Cpu }) {
  const severity = percent !== null && percent >= 85 ? 'critical' : percent !== null && percent >= 70 ? 'warning' : 'normal'
  return <article className={`instance-resource instance-resource--${severity}`}><header><span><Icon size={17} />{label}</span><strong>{value}</strong></header><div className="instance-resource__track" aria-label={`${label}: ${percent === null ? value : `${percent.toFixed(1)} %`}`}><i style={{ width: `${Math.min(100, percent ?? 0)}%` }} /></div><small>{detail}</small></article>
}

function SecurityRow({ check, language }: { check: SecurityCheck; language: 'fr' | 'en' }) {
  const status: InstanceStatusValue = check.passed === true ? 'operational' : check.passed === false ? 'misconfigured' : 'unknown'
  return <li><div><strong>{securityLabels[language][check.code] ?? check.code}</strong>{check.action && <small>{check.action}</small>}</div><StatusBadge status={status} language={language} /></li>
}

export function InstanceStatusPage() {
  const { locale } = useI18n()
  const language: 'fr' | 'en' = locale.toLowerCase().startsWith('fr') ? 'fr' : 'en'
  const t = text[language]
  const [view, setView] = useState<InstanceView>('overview')
  const [health, setHealth] = useState<InstanceHealth | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [logs, setLogs] = useState<InstanceLogEntry[]>([])
  const [logsLoading, setLogsLoading] = useState(false)
  const [logMeta, setLogMeta] = useState({ nextBefore: null as number | null, truncated: false, retention: 7 })
  const [level, setLevel] = useState<InstanceLogLevel | ''>('')
  const [component, setComponent] = useState('')
  const [search, setSearch] = useState('')
  const [order, setOrder] = useState<'newest' | 'oldest'>('newest')
  const [autoRefresh, setAutoRefresh] = useState(false)
  const [copyNotice, setCopyNotice] = useState<string | null>(null)

  const load = useCallback((signal?: AbortSignal) => {
    setLoading(true); setError(null)
    void getInstanceHealth(signal).then((result) => { if (!signal?.aborted) setHealth(result) }).catch((reason: unknown) => { if (!signal?.aborted) setError(reason instanceof Error ? reason.message : 'Diagnostic unavailable.') }).finally(() => { if (!signal?.aborted) setLoading(false) })
  }, [])
  useEffect(() => { const controller = new AbortController(); load(controller.signal); return () => controller.abort() }, [load])

  const loadLogs = useCallback(async (options: { append?: boolean; signal?: AbortSignal } = {}) => {
    setLogsLoading(true)
    try {
      const result = await getInstanceLogs({ level, component, search: search.trim(), order, before: options.append ? logMeta.nextBefore : null }, options.signal)
      if (!options.signal?.aborted) {
        setLogs((current) => options.append ? [...current, ...result.items] : result.items)
        setLogMeta({ nextBefore: result.next_before, truncated: result.truncated, retention: result.retention_days })
      }
    } catch (reason) {
      if (!options.signal?.aborted) setError(reason instanceof Error ? reason.message : 'Logs unavailable.')
    } finally { if (!options.signal?.aborted) setLogsLoading(false) }
  }, [component, level, logMeta.nextBefore, order, search])

  useEffect(() => {
    if (view !== 'logs') return
    const controller = new AbortController(); const timer = window.setTimeout(() => void loadLogs({ signal: controller.signal }), 250)
    return () => { controller.abort(); window.clearTimeout(timer) }
  }, [view, level, component, search, order]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (view !== 'logs' || !autoRefresh) return
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void loadLogs() }, 10_000)
    return () => window.clearInterval(timer)
  }, [autoRefresh, loadLogs, view])

  const refresh = async () => { setLoading(true); setError(null); try { setHealth(await refreshInstanceHealth()) } catch (reason) { setError(reason instanceof Error ? reason.message : 'Refresh failed.') } finally { setLoading(false) } }
  const stale = health ? Date.now() - new Date(health.checked_at).getTime() > health.cache_ttl_seconds * 2000 : false
  const c = health?.components
  const formatValue = (value: string | number | boolean | null | undefined) => value === null || value === undefined ? t.unknown : typeof value === 'boolean' ? value ? (language === 'fr' ? 'Oui' : 'Yes') : (language === 'fr' ? 'Non' : 'No') : String(value)

  return <section className="instance-status">
    <header className="admin-console__heading"><div><span>{t.eyebrow}</span><h2>{t.title}</h2><p>{t.subtitle}</p></div><button className="admin-console__refresh" disabled={loading} onClick={() => void refresh()}><RefreshCw className={loading ? 'is-spinning' : ''} size={16} />{t.refresh}</button></header>
    <nav className="instance-status__tabs" aria-label={t.title}>{(['overview', 'resources', 'logs', 'diagnostics'] as InstanceView[]).map((item) => <button key={item} type="button" aria-current={view === item ? 'page' : undefined} onClick={() => setView(item)}>{t[item]}</button>)}</nav>
    {error && <div className="form-alert" role="alert">{error}</div>}
    {loading && !health && <p role="status">{t.loading}</p>}
    {health && c && <>
      {view === 'overview' && <>
        <div className="instance-status__summary">
          <article><span>{t.global}</span><StatusBadge status={health.global_status} language={language} /></article>
          <article><span>{t.version}</span><strong>{health.summary.version}</strong><small>{health.summary.environment}</small></article>
          <article><span>{t.uptime}</span><strong>{duration(health.summary.uptime_seconds, language)}</strong><small>{t.sinceStart}</small></article>
          <article><span>{t.storage}</span><strong>{c.storage.usage_percent === null ? t.unavailable : `${c.storage.usage_percent.toFixed(1)} %`}</strong><small>{formatBytes(c.storage.free_bytes, locale)} {t.free}</small></article>
        </div>
        <section className="instance-status__panel"><header><div><AlertTriangle size={18} /><div><h3>{t.alerts}</h3><p>{language === 'fr' ? 'Seuils centralisés et actions recommandées.' : 'Centralized thresholds and recommended actions.'}</p></div></div></header>{health.alerts.length === 0 ? <p className="instance-status__empty">{t.noAlerts}</p> : <ul className="instance-status__alerts">{health.alerts.map((alert) => { const copy = alertCopy[language][alert.code]; return <li key={alert.code} className={`is-${alert.severity}`}><AlertTriangle size={16} /><div><strong>{copy?.message ?? alert.message}</strong>{(copy?.action ?? alert.action) && <small>{copy?.action ?? alert.action}</small>}</div></li> })}</ul>}</section>
        <section className="instance-status__panel"><header><div><Server size={18} /><div><h3>{t.services}</h3><p>{t.servicesHint}</p></div></div></header><ul className="instance-status__services">
          <ServiceRow icon={Server} name="CartaVault" item={c.application} detail={`v${c.application.backend_version} · ${c.application.deployment_mode}`} language={language} />
          <ServiceRow icon={Database} name="PostgreSQL / PostGIS" item={c.database} detail={`${c.database.latency_ms ?? '—'} ms · ${c.database.postgis_version ?? t.unknown}`} language={language} />
          <ServiceRow icon={HardDrive} name={t.storage} item={c.storage} detail={`${formatBytes(c.storage.photo_storage_bytes, locale)} · ${formatValue(c.storage.photo_count)} photos`} language={language} />
          <ServiceRow icon={Mail} name="Email" item={c.email} detail={`${c.email.provider} · ${c.email.configured ? t.configured : t.unavailable}`} language={language} />
          <ServiceRow icon={Route} name="Routing / OSRM" item={c.routing} detail={c.routing.osrm_available ? `${c.routing.osrm_latency_ms ?? '—'} ms` : t.unavailable} language={language} />
          <ServiceRow icon={Map} name="Basemaps" item={c.mapping} detail={`Fallback ${c.mapping.fallback_layer.toUpperCase()}`} language={language} />
        </ul></section>
        <section className="instance-status__panel"><header><div><Users size={18} /><div><h3>{t.usage}</h3><p>{t.usageHint}</p></div></div></header><div className="instance-status__metrics">{[
          [language === 'fr' ? 'Utilisateurs' : 'Users', c.usage.users_total, `${c.usage.users_active} ${t.active}`], [language === 'fr' ? 'Cartes' : 'Maps', c.usage.maps_total, `${c.usage.maps_shared} ${t.shared}`],
          [language === 'fr' ? 'Lieux' : 'Places', c.usage.places_total, `+${c.usage.new_places_30d} / 30d`], ['Photos', c.usage.photos_total, formatBytes(c.storage.photo_storage_bytes, locale)],
          [language === 'fr' ? 'Sorties' : 'Trips', c.usage.trips_total, language === 'fr' ? 'voyages préparés' : 'planned trips'], [language === 'fr' ? 'Invitations' : 'Invitations', c.usage.invitations_pending, t.pending],
        ].map(([label, number, hint]) => <article key={label}><span>{label}</span><strong>{formatValue(number)}</strong><small>{hint}</small></article>)}</div></section>
      </>}

      {view === 'resources' && <div className="instance-status__resource-grid">
        <Meter icon={Cpu} label={t.cpu} value={c.resources.cpu_percent === null ? t.unavailable : `${c.resources.cpu_percent.toFixed(1)} %`} percent={c.resources.cpu_percent} detail={`${t.scope}: ${formatResourceScope(c.resources.cpu_scope, language)}${c.resources.cpu_limit_cores ? ` · ${c.resources.cpu_limit_cores} CPU` : ''}`} />
        <Meter icon={MemoryStick} label={t.memory} value={`${formatBytes(c.resources.memory_used_bytes, locale)}${c.resources.memory_limit_bytes ? ` / ${formatBytes(c.resources.memory_limit_bytes, locale)}` : ''}`} percent={c.resources.memory_percent} detail={`${t.scope}: ${formatResourceScope(c.resources.memory_scope, language)}`} />
        <Meter icon={HardDrive} label={t.appDisk} value={`${formatBytes(c.storage.used_bytes, locale)} / ${formatBytes(c.storage.total_bytes, locale)}`} percent={c.storage.usage_percent} detail={`${formatBytes(c.storage.free_bytes, locale)} ${t.free}`} />
        <Meter icon={Database} label={t.database} value={formatBytes(c.database.database_size_bytes, locale)} percent={null} detail={`${c.database.active_connections ?? '—'} / ${c.database.max_connections ?? '—'} connections`} />
        <Meter icon={FileText} label={t.media} value={formatBytes(c.storage.photo_storage_bytes, locale)} percent={c.storage.total_bytes && c.storage.photo_storage_bytes !== null ? c.storage.photo_storage_bytes * 100 / c.storage.total_bytes : null} detail={`${formatValue(c.storage.photo_count)} photos · ${c.storage.backend_type}`} />
        <Meter icon={Server} label={t.workers} value={c.resources.worker_count === null ? t.unavailable : String(c.resources.worker_count)} percent={null} detail={c.resources.worker_source ?? (language === 'fr' ? 'Non déclaré' : 'Not declared')} />
      </div>}

      {view === 'logs' && <section className="instance-status__logs">
        <div className="instance-status__log-filters">
          <select aria-label={t.filterLevel} value={level} onChange={(event) => setLevel(event.target.value as InstanceLogLevel | '')}><option value="">{t.filterLevel}</option>{(['DEBUG', 'INFO', 'WARNING', 'ERROR', 'CRITICAL'] as InstanceLogLevel[]).map((item) => <option key={item}>{item}</option>)}</select>
          <select aria-label={t.filterComponent} value={component} onChange={(event) => setComponent(event.target.value)}><option value="">{t.filterComponent}</option>{logComponents.map((item) => <option key={item}>{item}</option>)}</select>
          <input aria-label={t.search} placeholder={t.search} value={search} onChange={(event) => setSearch(event.target.value)} />
          <select aria-label={language === 'fr' ? 'Ordre' : 'Order'} value={order} onChange={(event) => setOrder(event.target.value as 'newest' | 'oldest')}><option value="newest">{t.newest}</option><option value="oldest">{t.oldest}</option></select>
          <label className="instance-status__auto-refresh"><input type="checkbox" checked={autoRefresh} onChange={(event) => setAutoRefresh(event.target.checked)} />{t.autoRefresh}</label>
          <button type="button" className="panel-icon-button" aria-label={t.refresh} disabled={logsLoading} onClick={() => void loadLogs()}><RefreshCw className={logsLoading ? 'is-spinning' : ''} size={15} /></button>
        </div>
        <p className="instance-status__log-retention">{language === 'fr' ? `Conservation : ${logMeta.retention} jours` : `Retention: ${logMeta.retention} days`}{logMeta.truncated ? ` · ${language === 'fr' ? 'liste paginée' : 'paginated list'}` : ''}</p>
        {logs.length === 0 && !logsLoading ? <p className="instance-status__empty">{t.emptyLogs}</p> : <ol className="instance-status__log-list">{logs.map((entry) => <li key={entry.id}><time dateTime={entry.timestamp}>{new Date(entry.timestamp).toLocaleTimeString(locale)}</time><b data-level={entry.level}>{entry.level}</b><strong>{entry.component}</strong><span>{entry.message}</span><button type="button" aria-label={`${language === 'fr' ? 'Copier' : 'Copy'} ${entry.id}`} onClick={() => void navigator.clipboard.writeText(`${entry.timestamp} ${entry.level} ${entry.component} ${entry.message}`).then(() => { setCopyNotice(t.copied); window.setTimeout(() => setCopyNotice(null), 2000) })}><Copy size={13} /></button></li>)}</ol>}
        {copyNotice && <p className="instance-status__copy-notice" role="status">{copyNotice}</p>}
        {logMeta.nextBefore && order === 'newest' && <button type="button" className="secondary-button instance-status__load-more" disabled={logsLoading} onClick={() => void loadLogs({ append: true })}>{t.loadMore}</button>}
      </section>}

      {view === 'diagnostics' && <>
        <div className="instance-status__columns">
          <section className="instance-status__panel"><header><div><Server size={18} /><div><h3>Runtime</h3><p>CartaVault / Python</p></div></div></header><dl><dt>Version</dt><dd>{c.application.version}</dd><dt>Build</dt><dd>{c.application.build_commit ?? t.unknown}</dd><dt>{t.environment}</dt><dd>{c.application.environment}</dd><dt>{t.started}</dt><dd>{new Date(c.application.started_at).toLocaleString(locale)}</dd><dt>{t.workers}</dt><dd>{c.resources.worker_count ?? t.unknown}</dd></dl></section>
          <section className="instance-status__panel"><header><div><Database size={18} /><div><h3>{t.database}</h3><p>PostgreSQL / PostGIS / Alembic</p></div></div><StatusBadge status={c.database.status} language={language} /></header><dl><dt>PostgreSQL</dt><dd>{c.database.postgresql_version ?? t.unknown}</dd><dt>PostGIS</dt><dd>{c.database.postgis_version ?? t.unknown}</dd><dt>Alembic</dt><dd>{c.database.alembic_current_revision ?? t.unknown} ({c.database.alembic_status})</dd><dt>Pool</dt><dd>{c.database.pool_checked_out ?? '—'} / {c.database.pool_size ?? '—'}</dd></dl></section>
        </div>
        <section className="instance-status__panel"><header><div><ShieldCheck size={18} /><div><h3>{t.security}</h3><p>{c.security.disclaimer}</p></div></div><StatusBadge status={c.security.status} language={language} /></header><ul className="instance-status__checks">{c.security.checks.map((check) => <SecurityRow key={check.code} check={check} language={language} />)}</ul></section>
        <div className="instance-status__columns">
          <section className="instance-status__panel"><header><div><Clock3 size={18} /><div><h3>{t.maintenance}</h3></div></div><StatusBadge status={c.maintenance.status} language={language} /></header><dl><dt>Alembic</dt><dd>{c.database.alembic_status}</dd><dt>{t.expiredSessions}</dt><dd>{formatValue(c.maintenance.expired_sessions)}</dd><dt>{t.expiredTokens}</dt><dd>{formatValue(c.maintenance.expired_action_tokens)}</dd><dt>{t.temporaryExports}</dt><dd>{formatValue(c.maintenance.temporary_exports_pending_cleanup)}</dd></dl></section>
          <section className="instance-status__panel"><header><div><Archive size={18} /><div><h3>{t.backups}</h3></div></div><StatusBadge status={c.backups.status} language={language} /></header>{c.backups.known ? <dl><dt>Database</dt><dd>{formatValue(c.backups.last_database_backup_at)}</dd><dt>Restore test</dt><dd>{formatValue(c.backups.last_restore_test_at)}</dd></dl> : <p className="instance-status__empty">{language === 'fr' ? 'Aucune source de vérité configurée.' : 'No backup source of truth configured.'}</p>}</section>
        </div>
        <section className="instance-status__panel"><header><div><AlertTriangle size={18} /><div><h3>{t.controlledErrors}</h3></div></div></header>{health.recent_errors.length === 0 ? <p className="instance-status__empty">{t.noErrors}</p> : <ul className="instance-status__errors">{health.recent_errors.map((item) => <li key={`${item.component}-${item.code}`}><strong>{item.component}</strong><span>{item.code}</span><StatusBadge status={item.status as InstanceStatusValue} language={language} /></li>)}</ul>}</section>
      </>}
      <footer className="instance-status__footer"><span>{t.checked} {new Date(health.checked_at).toLocaleString(locale)}</span>{stale && <strong>{t.stale}</strong>}</footer>
    </>}
  </section>
}
