import {
  Check,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Database,
  KeyRound,
  LoaderCircle,
  Mail,
  Map,
  ServerCog,
  ShieldCheck,
  UserRound,
} from 'lucide-react'
import { useMemo, useState } from 'react'

import {
  completeInitialSetup,
  verifySetupToken,
  type SetupCompletion,
  type SetupStatus,
} from '../api/setup'
import { AuthLayout } from '../components/auth/AuthLayout'

type SetupPageProps = {
  status: SetupStatus
  onCompleted: () => void
}

const stepIcons = [ServerCog, UserRound, Database, Mail, Map, ShieldCheck]
const stepLabels = ['Vérifications', 'Administrateur', 'Instance', 'E-mail', 'Cartographie', 'Validation']

function initialPayload(): SetupCompletion {
  const publicUrl = window.location.origin
  return {
    administrator: {
      email: '',
      display_name: '',
      password: '',
      password_confirmation: '',
      language: 'fr',
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    },
    instance: {
      instance_name: 'CartaVault',
      public_url: publicUrl,
      default_language: 'fr',
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
      public_registration_enabled: false,
      maximum_upload_megabytes: 10,
      support_address: null,
    },
    email: {
      provider: 'none',
      api_key: null,
      sender_address: null,
      sender_name: 'CartaVault',
      reply_to_address: null,
    },
    mapping: {
      default_basemap: 'cartavault-light',
      default_routing_engine: 'osrm',
    },
  }
}

export function SetupPage({ status, onCompleted }: SetupPageProps) {
  const [step, setStep] = useState(0)
  const [token, setToken] = useState('')
  const [tokenVerified, setTokenVerified] = useState(false)
  const [payload, setPayload] = useState<SetupCompletion>(initialPayload)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const blockingChecks = status.checks.filter((check) => check.status === 'error')
  const canContinue = useMemo(() => {
    if (step === 0) return tokenVerified && blockingChecks.length === 0
    if (step === 1) {
      const admin = payload.administrator
      return Boolean(admin.email && admin.display_name && admin.password.length >= 12 && admin.password === admin.password_confirmation)
    }
    if (step === 2) return Boolean(payload.instance.instance_name && payload.instance.public_url)
    if (step === 3) {
      return payload.email.provider === 'none'
        || Boolean(payload.email.api_key?.startsWith('re_') && payload.email.sender_address)
    }
    return true
  }, [blockingChecks.length, payload, step, tokenVerified])

  const verifyToken = async () => {
    setBusy(true)
    setError(null)
    try {
      await verifySetupToken(token.trim())
      setTokenVerified(true)
    } catch (caught) {
      setTokenVerified(false)
      setError(caught instanceof Error ? caught.message : 'Le jeton est invalide.')
    } finally {
      setBusy(false)
    }
  }

  const complete = async () => {
    setBusy(true)
    setError(null)
    try {
      await completeInitialSetup(token.trim(), payload)
      onCompleted()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'La configuration initiale a échoué.')
    } finally {
      setBusy(false)
    }
  }

  const updateAdministrator = (values: Partial<SetupCompletion['administrator']>) => {
    setPayload((current) => ({ ...current, administrator: { ...current.administrator, ...values } }))
  }
  const updateInstance = (values: Partial<SetupCompletion['instance']>) => {
    setPayload((current) => ({ ...current, instance: { ...current.instance, ...values } }))
  }
  const updateEmail = (values: Partial<SetupCompletion['email']>) => {
    setPayload((current) => ({ ...current, email: { ...current.email, ...values } }))
  }
  const updateMapping = (values: Partial<SetupCompletion['mapping']>) => {
    setPayload((current) => ({ ...current, mapping: { ...current.mapping, ...values } }))
  }

  return (
    <AuthLayout>
      <article className="setup-card" aria-labelledby="setup-title">
        <header className="setup-card__header">
          <span>Configuration initiale</span>
          <h1 id="setup-title">Bienvenue dans CartaVault</h1>
          <p>Configurez votre instance en quelques étapes. Aucun secret ne sera affiché après validation.</p>
        </header>

        <ol className="setup-steps" aria-label="Étapes de configuration">
          {stepLabels.map((label, index) => {
            const Icon = stepIcons[index]
            return (
              <li key={label} className={index === step ? 'is-current' : index < step ? 'is-complete' : ''}>
                <span>{index < step ? <Check /> : <Icon />}</span>
                <small>{label}</small>
              </li>
            )
          })}
        </ol>

        {error && <div className="setup-alert setup-alert--error" role="alert"><CircleAlert />{error}</div>}

        <section className="setup-card__body">
          {step === 0 && (
            <div className="setup-section">
              <div className="setup-section__intro"><KeyRound /><div><h2>Jeton et prérequis</h2><p>Saisissez le jeton affiché par la commande de génération des secrets.</p></div></div>
              <label className="setup-field">
                <span>Jeton de configuration</span>
                <div className="setup-token-control">
                  <input type="password" autoComplete="off" value={token} onChange={(event) => { setToken(event.target.value); setTokenVerified(false) }} />
                  <button type="button" disabled={busy || !token.trim()} onClick={() => void verifyToken()}>
                    {busy ? <LoaderCircle className="is-spinning" /> : tokenVerified ? <Check /> : <KeyRound />}
                    {tokenVerified ? 'Vérifié' : 'Vérifier'}
                  </button>
                </div>
              </label>
              <div className="setup-checks">
                {status.checks.map((check) => (
                  <div key={check.key} className={`setup-check setup-check--${check.status}`}>
                    {check.status === 'ready' ? <Check /> : <CircleAlert />}
                    <span><strong>{check.label}</strong><small>{check.detail}</small></span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="setup-section">
              <div className="setup-section__intro"><UserRound /><div><h2>Premier administrateur</h2><p>Ce compte disposera de tous les droits sur l’instance.</p></div></div>
              <div className="setup-grid">
                <label className="setup-field"><span>Nom affiché</span><input value={payload.administrator.display_name} onChange={(event) => updateAdministrator({ display_name: event.target.value })} /></label>
                <label className="setup-field"><span>Adresse e-mail</span><input type="email" value={payload.administrator.email} onChange={(event) => updateAdministrator({ email: event.target.value })} /></label>
                <label className="setup-field"><span>Mot de passe</span><input type="password" minLength={12} value={payload.administrator.password} onChange={(event) => updateAdministrator({ password: event.target.value })} /></label>
                <label className="setup-field"><span>Confirmation</span><input type="password" minLength={12} value={payload.administrator.password_confirmation} onChange={(event) => updateAdministrator({ password_confirmation: event.target.value })} /></label>
                <label className="setup-field"><span>Langue</span><select value={payload.administrator.language} onChange={(event) => updateAdministrator({ language: event.target.value as 'en' | 'fr' })}><option value="fr">Français</option><option value="en">English</option></select></label>
                <label className="setup-field"><span>Fuseau horaire</span><input value={payload.administrator.timezone} onChange={(event) => updateAdministrator({ timezone: event.target.value })} /></label>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="setup-section">
              <div className="setup-section__intro"><Database /><div><h2>Paramètres de l’instance</h2><p>Ces valeurs pourront ensuite être ajustées dans l’administration.</p></div></div>
              <div className="setup-grid">
                <label className="setup-field"><span>Nom de l’instance</span><input value={payload.instance.instance_name} onChange={(event) => updateInstance({ instance_name: event.target.value })} /></label>
                <label className="setup-field"><span>URL publique</span><input type="url" value={payload.instance.public_url} onChange={(event) => updateInstance({ public_url: event.target.value })} /></label>
                <label className="setup-field"><span>Langue par défaut</span><select value={payload.instance.default_language} onChange={(event) => updateInstance({ default_language: event.target.value as 'en' | 'fr' })}><option value="fr">Français</option><option value="en">English</option></select></label>
                <label className="setup-field"><span>Taille maximale d’un upload (Mio)</span><input type="number" min={1} max={500} value={payload.instance.maximum_upload_megabytes} onChange={(event) => updateInstance({ maximum_upload_megabytes: Number(event.target.value) })} /></label>
                <label className="setup-field setup-field--wide"><span>Adresse de support (facultatif)</span><input type="email" value={payload.instance.support_address ?? ''} onChange={(event) => updateInstance({ support_address: event.target.value || null })} /></label>
                <label className="setup-checkbox setup-field--wide"><input type="checkbox" checked={payload.instance.public_registration_enabled} onChange={(event) => updateInstance({ public_registration_enabled: event.target.checked })} /><span>Autoriser les demandes d’inscription publiques</span></label>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="setup-section">
              <div className="setup-section__intro"><Mail /><div><h2>Envoi d’e-mails</h2><p>Cette étape est facultative et peut être configurée plus tard.</p></div></div>
              <label className="setup-field"><span>Fournisseur</span><select value={payload.email.provider} onChange={(event) => updateEmail({ provider: event.target.value as 'none' | 'resend' })}><option value="none">Aucun pour le moment</option><option value="resend">Resend</option></select></label>
              {payload.email.provider === 'resend' && <div className="setup-grid">
                <label className="setup-field setup-field--wide"><span>Clé API Resend</span><input type="password" autoComplete="off" value={payload.email.api_key ?? ''} onChange={(event) => updateEmail({ api_key: event.target.value || null })} /></label>
                <label className="setup-field"><span>Adresse d’expédition</span><input type="email" value={payload.email.sender_address ?? ''} onChange={(event) => updateEmail({ sender_address: event.target.value || null })} /></label>
                <label className="setup-field"><span>Nom d’expédition</span><input value={payload.email.sender_name} onChange={(event) => updateEmail({ sender_name: event.target.value })} /></label>
                <label className="setup-field setup-field--wide"><span>Adresse de réponse (facultatif)</span><input type="email" value={payload.email.reply_to_address ?? ''} onChange={(event) => updateEmail({ reply_to_address: event.target.value || null })} /></label>
              </div>}
            </div>
          )}

          {step === 4 && (
            <div className="setup-section">
              <div className="setup-section__intro"><Map /><div><h2>Cartographie et routage</h2><p>Choisissez les valeurs proposées par défaut aux utilisateurs.</p></div></div>
              <div className="setup-grid">
                <label className="setup-field"><span>Fond de carte</span><select value={payload.mapping.default_basemap} onChange={(event) => updateMapping({ default_basemap: event.target.value as SetupCompletion['mapping']['default_basemap'] })}><option value="cartavault-light">CartaVault clair</option><option value="cartavault-dark">CartaVault sombre</option><option value="osm-standard">OSM Standard</option><option value="satellite">Satellite</option></select></label>
                <label className="setup-field"><span>Moteur de routage</span><select value={payload.mapping.default_routing_engine} onChange={(event) => updateMapping({ default_routing_engine: event.target.value as SetupCompletion['mapping']['default_routing_engine'] })}><option value="osrm">OSRM</option><option value="google_routes">Google Routes</option></select></label>
              </div>
            </div>
          )}

          {step === 5 && (
            <div className="setup-section">
              <div className="setup-section__intro"><ShieldCheck /><div><h2>Résumé de sécurité</h2><p>Vérifiez ces informations avant de créer définitivement l’instance.</p></div></div>
              <dl className="setup-summary">
                <div><dt>Administrateur</dt><dd>{payload.administrator.email}</dd></div>
                <div><dt>Instance</dt><dd>{payload.instance.instance_name}</dd></div>
                <div><dt>URL publique</dt><dd>{payload.instance.public_url}</dd></div>
                <div><dt>E-mail</dt><dd>{payload.email.provider === 'resend' ? 'Resend configuré' : 'Non configuré'}</dd></div>
                <div><dt>Routage</dt><dd>{payload.mapping.default_routing_engine === 'osrm' ? 'OSRM' : 'Google Routes'}</dd></div>
              </dl>
              <div className="setup-alert"><ShieldCheck />Le jeton de configuration ne sera plus utilisable dès la création de l’administrateur.</div>
            </div>
          )}
        </section>

        <footer className="setup-card__footer">
          <button type="button" className="setup-button setup-button--secondary" disabled={step === 0 || busy} onClick={() => setStep((current) => current - 1)}><ChevronLeft />Retour</button>
          {step < stepLabels.length - 1
            ? <button type="button" className="setup-button" disabled={!canContinue || busy} onClick={() => setStep((current) => current + 1)}>Continuer<ChevronRight /></button>
            : <button type="button" className="setup-button" disabled={busy} onClick={() => void complete()}>{busy ? <LoaderCircle className="is-spinning" /> : <ShieldCheck />}Créer l’instance</button>}
        </footer>
      </article>
    </AuthLayout>
  )
}
