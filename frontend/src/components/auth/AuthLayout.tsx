import {
  CheckCircle2,
  Eye,
  EyeOff,
  LockKeyhole,
  Map,
  MapPin,
  Moon,
  Route,
  ShieldCheck,
  Sun,
  type LucideIcon,
} from 'lucide-react'
import {
  useId,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
} from 'react'

import { useTheme } from '../../theme/useTheme'
import { useI18n } from '../../i18n/useI18n'

type AuthCardProps = {
  title: string
  subtitle: string
  children: ReactNode
  footer?: ReactNode
  status?: 'default' | 'success'
}

type AuthInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> & {
  label: string
  icon: LucideIcon
  hint?: ReactNode
}

type AuthPasswordInputProps = Omit<AuthInputProps, 'icon' | 'type'>

export function AuthLayout({ children }: { children: ReactNode }) {
  const { resolvedTheme, toggleTheme } = useTheme()
  const { t } = useI18n()
  const nextThemeLabel = resolvedTheme === 'dark' ? t('auth.theme.light') : t('auth.theme.dark')

  return (
    <main className="auth-page">
      <div className="auth-shell">
        <AuthBrandingPanel />
        <section className="auth-stage" aria-label={t('auth.layoutLabel')}>
          <button
            className="auth-theme-toggle"
            type="button"
            aria-label={nextThemeLabel}
            title={nextThemeLabel}
            onClick={toggleTheme}
          >
            {resolvedTheme === 'dark' ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
          </button>
          <div className="auth-stage__content">{children}</div>
        </section>
      </div>
    </main>
  )
}

export function AuthBrandingPanel() {
  const { t } = useI18n()
  const features: Array<{ icon: LucideIcon; title: string; description: string }> = [
    { icon: Map, title: t('auth.feature.maps.title'), description: t('auth.feature.maps.description') },
    { icon: MapPin, title: t('auth.feature.places.title'), description: t('auth.feature.places.description') },
    { icon: Route, title: t('auth.feature.trips.title'), description: t('auth.feature.trips.description') },
  ]
  return (
    <aside className="auth-branding" aria-label={`CartaVault, ${t('auth.privateSpace')}`}>
      <div className="auth-branding__content">
        <header className="auth-branding__brand">
          <img src="/cartavault-logo.png" alt="" />
          <strong className="auth-branding__wordmark" aria-label="CartaVault">
            <span>Carta</span><b>Vault</b>
          </strong>
          <span className="auth-branding__eyebrow">{t('auth.privateSpace')}</span>
        </header>

        <div className="auth-branding__message">
          <h2>{t('auth.heroTitle').split('\n').map((line) => <span key={line}>{line}<br /></span>)}</h2>
          <p>{t('auth.heroDescription')}</p>
        </div>

        <ul className="auth-branding__features">
          {features.map(({ icon: Icon, title, description }) => (
            <li key={title}>
              <span className="auth-branding__feature-icon"><Icon aria-hidden="true" /></span>
              <span>
                <strong>{title}</strong>
                <small>{description}</small>
              </span>
            </li>
          ))}
        </ul>

        <footer className="auth-branding__security">
          <LockKeyhole aria-hidden="true" />
          <span><strong>{t('auth.security.title')}</strong><small>{t('auth.security.description')}</small></span>
        </footer>
      </div>
    </aside>
  )
}

export function AuthCard({ title, subtitle, children, footer, status = 'default' }: AuthCardProps) {
  const titleId = useId()
  return (
    <article className={`auth-card auth-card--${status}`} aria-labelledby={titleId}>
      <AuthHeader titleId={titleId} title={title} subtitle={subtitle} status={status} />
      <div className="auth-card__body">{children}</div>
      {footer && <AuthFooter>{footer}</AuthFooter>}
    </article>
  )
}

export function AuthHeader({
  titleId,
  title,
  subtitle,
  status = 'default',
}: {
  titleId: string
  title: string
  subtitle: string
  status?: 'default' | 'success'
}) {
  return (
    <header className="auth-card__header">
      {status === 'success' && <span className="auth-card__success-icon"><CheckCircle2 aria-hidden="true" /></span>}
      <div>
        <h1 id={titleId}>{title}</h1>
        <p>{subtitle}</p>
      </div>
    </header>
  )
}

export function AuthInput({ label, icon: Icon, hint, className = '', ...inputProps }: AuthInputProps) {
  const id = useId()
  return (
    <div className="auth-field">
      <label className="auth-field__label" htmlFor={id}>{label}</label>
      <span className="auth-field__control">
        <Icon className="auth-field__icon" aria-hidden="true" />
        <input id={id} className={className} {...inputProps} />
      </span>
      {hint && <small className="auth-field__hint">{hint}</small>}
    </div>
  )
}

export function AuthPasswordInput({ label, ...inputProps }: AuthPasswordInputProps) {
  const { t } = useI18n()
  const id = useId()
  const [visible, setVisible] = useState(false)
  return (
    <div className="auth-field">
      <label className="auth-field__label" htmlFor={id}>{label}</label>
      <span className="auth-field__control">
        <LockKeyhole className="auth-field__icon" aria-hidden="true" />
        <input id={id} type={visible ? 'text' : 'password'} {...inputProps} />
        <button
          className="auth-field__visibility"
          type="button"
          aria-label={visible ? t('auth.password.hide') : t('auth.password.show')}
          aria-pressed={visible}
          onClick={() => setVisible((current) => !current)}
        >
          {visible ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
        </button>
      </span>
      {inputProps.minLength && <small className="auth-field__hint">{t('auth.password.minimum', { count: inputProps.minLength })}</small>}
    </div>
  )
}

export function AuthSecureNotice() {
  const { t } = useI18n()
  return (
    <div className="auth-secure-notice">
      <span><ShieldCheck aria-hidden="true" /></span>
      <p><strong>{t('auth.secure.title')}</strong><small>{t('auth.secure.description')}</small></p>
    </div>
  )
}

export function AuthFooter({ children }: { children: ReactNode }) {
  return <footer className="auth-card__footer">{children}</footer>
}

export function AuthSubmitButton({
  children,
  ...buttonProps
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button className="auth-submit" type="submit" {...buttonProps}>{children}</button>
}
