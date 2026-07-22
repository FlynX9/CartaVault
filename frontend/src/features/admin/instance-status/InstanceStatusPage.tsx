import { useCallback, useEffect, useState } from 'react'
import {
  AlertTriangle, Archive, CheckCircle2, Clock3, Database, HardDrive, Mail,
  Map, RefreshCw, Route, Server, ShieldCheck, Users, XCircle,
} from 'lucide-react'

import { getInstanceHealth, refreshInstanceHealth } from '../../../api/adminConsole'
import type {
  DiagnosticBase, InstanceHealth, InstanceStatusValue, SecurityCheck,
} from '../../../types/adminConsole'

const statusLabels: Record<InstanceStatusValue, string> = {
  operational: 'Opérationnel', degraded: 'Dégradé', unavailable: 'Indisponible',
  misconfigured: 'Mal configuré', unknown: 'Inconnu',
}

const securityLabels: Record<string, string> = {
  'security.https_enabled': 'HTTPS actif en production',
  'security.secure_cookie': 'Cookies de session sécurisés',
  'security.csrf_enabled': 'Protection CSRF active',
  'security.debug_disabled': 'Mode debug désactivé',
  'security.credential_encryption': 'Chiffrement des identifiants configuré',
  'security.email_configured': 'Service email configuré',
  'security.backup_known': 'Sauvegardes documentées',
  'security.mfa_admins': 'MFA des administrateurs',
  'security.public_registration': 'Politique d’inscription publique',
}

const serviceErrorLabels: Record<string, string> = {
  INSTANCE_DATABASE_UNAVAILABLE: 'La base de données ne répond pas au contrôle.',
  INSTANCE_STORAGE_PROBE_FAILED: 'Le stockage local ne peut pas être vérifié.',
  OSRM_UNAVAILABLE: 'Le moteur OSRM ne répond pas actuellement.',
  OSRM_UNEXPECTED_RESPONSE: 'Le moteur OSRM a renvoyé une réponse inattendue.',
  BACKUP_STATUS_UNKNOWN: 'CartaVault ne dispose pas de métadonnées de sauvegarde.',
}

function StatusBadge({ status }: { status: InstanceStatusValue }) {
  const Icon = status === 'operational' ? CheckCircle2 : status === 'unavailable' || status === 'misconfigured' ? XCircle : AlertTriangle
  return <span className={`instance-status__badge instance-status__badge--${status}`}><Icon size={13} aria-hidden="true" />{statusLabels[status]}</span>
}

function bytes(value: number | null) {
  if (value === null) return 'Non mesuré'
  if (value < 1024) return `${value} o`
  if (value < 1024 ** 2) return `${(value / 1024).toFixed(1)} Kio`
  if (value < 1024 ** 3) return `${(value / 1024 ** 2).toFixed(1)} Mio`
  return `${(value / 1024 ** 3).toFixed(1)} Gio`
}

function duration(seconds: number) {
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  return [days ? `${days} j` : '', hours ? `${hours} h` : '', `${minutes} min`].filter(Boolean).join(' ')
}

function value(value: string | number | boolean | null | undefined) {
  if (value === null || value === undefined) return 'Inconnu'
  if (typeof value === 'boolean') return value ? 'Oui' : 'Non'
  return String(value)
}

function ServiceRow({ icon: Icon, name, item, detail }: {
  icon: typeof Server; name: string; item: DiagnosticBase; detail: string
}) {
  return <li><span className="instance-status__service-icon"><Icon size={17} aria-hidden="true" /></span><div><strong>{name}</strong><small>{detail}</small></div><StatusBadge status={item.status} /></li>
}

function SecurityRow({ check }: { check: SecurityCheck }) {
  const status: InstanceStatusValue = check.passed === true ? 'operational' : check.passed === false ? 'misconfigured' : 'unknown'
  return <li><div><strong>{securityLabels[check.code] ?? check.code}</strong>{check.action && <small>{check.action}</small>}</div><StatusBadge status={status} /></li>
}

export function InstanceStatusPage() {
  const [health, setHealth] = useState<InstanceHealth | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback((signal?: AbortSignal) => {
    setLoading(true); setError(null)
    void getInstanceHealth(signal)
      .then((result) => { if (!signal?.aborted) setHealth(result) })
      .catch((reason: unknown) => { if (!signal?.aborted) setError(reason instanceof Error ? reason.message : 'Diagnostic impossible.') })
      .finally(() => { if (!signal?.aborted) setLoading(false) })
  }, [])

  useEffect(() => { const controller = new AbortController(); load(controller.signal); return () => controller.abort() }, [load])

  const refresh = async () => {
    setLoading(true); setError(null)
    try { setHealth(await refreshInstanceHealth()) }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Actualisation impossible.') }
    finally { setLoading(false) }
  }

  const stale = health ? Date.now() - new Date(health.checked_at).getTime() > health.cache_ttl_seconds * 2000 : false
  const c = health?.components

  return <section className="instance-status">
    <header className="admin-console__heading"><div><span>Supervision</span><h2>État de l’instance</h2><p>Vue synthétique, sûre et non intrusive de CartaVault.</p></div><button className="admin-console__refresh" disabled={loading} onClick={() => void refresh()}><RefreshCw className={loading ? 'is-spinning' : ''} size={16} />Actualiser</button></header>
    {error && <div className="form-alert" role="alert">{error}</div>}
    {loading && !health && <p role="status">Diagnostic en cours…</p>}
    {health && c && <>
      <div className="instance-status__summary">
        <article><span>État global</span><StatusBadge status={health.global_status} /></article>
        <article><span>Version</span><strong>{health.summary.version}</strong><small>{health.summary.environment}</small></article>
        <article><span>Disponibilité</span><strong>{duration(health.summary.uptime_seconds)}</strong><small>depuis le dernier démarrage</small></article>
        <article><span>Stockage</span><strong>{c.storage.usage_percent === null ? 'Non mesuré' : `${c.storage.usage_percent.toFixed(1)} %`}</strong><small>{bytes(c.storage.free_bytes)} libres</small></article>
      </div>

      <section className="instance-status__panel"><header><div><Server size={18} /><div><h3>Services</h3><p>Contrôles bornés, mis en cache pendant {health.cache_ttl_seconds} secondes.</p></div></div></header><ul className="instance-status__services">
        <ServiceRow icon={Server} name="Backend" item={c.application} detail={`v${c.application.backend_version} · ${c.application.deployment_mode}`} />
        <ServiceRow icon={Database} name="PostgreSQL" item={c.database} detail={`${c.database.latency_ms ?? '—'} ms · ${c.database.postgresql_version ?? 'version inconnue'}`} />
        <ServiceRow icon={Database} name="PostGIS" item={{ ...c.database, status: c.database.postgis_available ? 'operational' : c.database.status === 'unavailable' ? 'unavailable' : 'degraded' }} detail={c.database.postgis_version ?? 'Version inconnue'} />
        <ServiceRow icon={HardDrive} name="Stockage local" item={c.storage} detail={`${bytes(c.storage.used_bytes)} utilisés · ${value(c.storage.photo_count)} photos`} />
        <ServiceRow icon={Mail} name="Email / Resend" item={c.email} detail={c.email.configured === null ? 'Configuration inconnue' : c.email.configured ? `Expéditeur ${c.email.sender_address ?? 'non renseigné'}` : 'Non configuré'} />
        <ServiceRow icon={Route} name="Routage / OSRM" item={c.routing} detail={c.routing.osrm_available ? `${c.routing.osrm_latency_ms ?? '—'} ms` : 'Disponibilité non confirmée'} />
        <ServiceRow icon={Map} name="Cartographie" item={c.mapping} detail={`Repli ${c.mapping.fallback_layer.toUpperCase()}`} />
        <ServiceRow icon={ShieldCheck} name="HTTPS" item={c.https} detail={c.https.https_detected ? 'Connexion HTTPS détectée' : 'Non observable depuis cette requête'} />
        <ServiceRow icon={Server} name="Redis" item={{ status: 'unknown', checked_at: health.checked_at, error_code: null }} detail="Aucun service Redis déclaré" />
        <ServiceRow icon={Server} name="Workers" item={{ status: 'unknown', checked_at: health.checked_at, error_code: null }} detail="Aucun worker asynchrone déclaré" />
      </ul></section>

      <section className="instance-status__panel"><header><div><Users size={18} /><div><h3>Usage</h3><p>Volumes agrégés de l’instance, sans donnée personnelle.</p></div></div></header><div className="instance-status__metrics">
        {[
          ['Utilisateurs', c.usage.users_total, `${c.usage.users_active} actifs`], ['Cartes', c.usage.maps_total, `${c.usage.maps_shared} partagées`],
          ['Lieux', c.usage.places_total, `+${c.usage.new_places_30d} sur 30 jours`], ['Photos', c.usage.photos_total, bytes(c.storage.photo_storage_bytes)],
          ['Sorties', c.usage.trips_total, 'voyages préparés'], ['Invitations', c.usage.invitations_pending, 'en attente'],
        ].map(([label, number, hint]) => <article key={label}><span>{label}</span><strong>{value(number)}</strong><small>{hint}</small></article>)}
      </div></section>

      <section className="instance-status__panel"><header><div><ShieldCheck size={18} /><div><h3>Sécurité</h3><p>{c.security.disclaimer}</p></div></div><StatusBadge status={c.security.status} /></header><ul className="instance-status__checks">{c.security.checks.map((check) => <SecurityRow key={check.code} check={check} />)}</ul></section>

      <div className="instance-status__columns">
        <section className="instance-status__panel"><header><div><Clock3 size={18} /><div><h3>Maintenance</h3><p>Éléments arrivés à échéance.</p></div></div><StatusBadge status={c.maintenance.status} /></header><dl>
          <dt>Révision Alembic</dt><dd>{c.database.alembic_current_revision ?? 'Inconnue'} ({c.database.alembic_status})</dd>
          <dt>Sessions expirées</dt><dd>{value(c.maintenance.expired_sessions)}</dd><dt>Jetons expirés</dt><dd>{value(c.maintenance.expired_action_tokens)}</dd>
          <dt>Invitations expirées</dt><dd>{value(c.maintenance.expired_invitations)}</dd><dt>Exports temporaires</dt><dd>{value(c.maintenance.temporary_exports_pending_cleanup)}</dd>
        </dl></section>
        <section className="instance-status__panel"><header><div><Archive size={18} /><div><h3>Sauvegardes</h3><p>Information déclarative uniquement.</p></div></div><StatusBadge status={c.backups.status} /></header>{c.backups.known ? <dl><dt>Dernière sauvegarde</dt><dd>{value(c.backups.last_database_backup_at)}</dd><dt>Dernier test de restauration</dt><dd>{value(c.backups.last_restore_test_at)}</dd></dl> : <p className="instance-status__empty">Aucune source de vérité sur les sauvegardes n’est configurée.</p>}</section>
      </div>

      <section className="instance-status__panel"><header><div><AlertTriangle size={18} /><div><h3>Erreurs contrôlées récentes</h3><p>Diagnostics de cette vérification, sans trace technique ni secret.</p></div></div></header>{health.recent_errors.length === 0 ? <p className="instance-status__empty">Aucune erreur contrôlée détectée.</p> : <ul className="instance-status__errors">{health.recent_errors.map((item) => <li key={`${item.component}-${item.code}`}><strong>{item.component}</strong><span>{serviceErrorLabels[item.code] ?? 'Une anomalie contrôlée a été détectée.'}</span><StatusBadge status={item.status as InstanceStatusValue} /></li>)}</ul>}</section>
      <footer className="instance-status__footer"><span>Vérifié le {new Date(health.checked_at).toLocaleString('fr-FR')}</span>{stale && <strong>Les données affichées peuvent être anciennes.</strong>}</footer>
    </>}
  </section>
}
