import { useEffect, useRef, useState, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import { Lightbulb, Send, ShieldAlert, X } from 'lucide-react'

import { sendContactMessage } from '../../api/contact'
import { useI18n } from '../../i18n/useI18n'


export function ContactModal({ onClose }: { onClose: () => void }) {
  const { t } = useI18n()
  const dialog = useRef<HTMLElement>(null)
  const [kind, setKind] = useState<'incident' | 'suggestion'>('incident')
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setSending(true); setError(null)
    try { await sendContactMessage(kind, message.trim()); onClose() }
    catch (reason) { setError(reason instanceof Error ? reason.message : t('contact.error')) }
    finally { setSending(false) }
  }

  return createPortal(
    <div className="contact-modal-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <section ref={dialog} className="contact-modal" role="dialog" aria-modal="true" aria-labelledby="contact-modal-title">
        <header className="contact-modal__header"><div><span>{t('contact.eyebrow')}</span><h2 id="contact-modal-title">{t('contact.title')}</h2><p>{t('contact.description')}</p></div><button className="panel-icon-button modal-header-close" type="button" aria-label={t('common.close')} onClick={onClose}><X size={15} /></button></header>
        <form className="contact-modal__form" onSubmit={(event) => void submit(event)}>
          <fieldset><legend>{t('contact.type')}</legend>
            <label className={kind === 'incident' ? 'is-selected' : ''}><input type="radio" name="contact-kind" value="incident" checked={kind === 'incident'} onChange={() => setKind('incident')} /><ShieldAlert size={18} /><span><strong>{t('contact.incident')}</strong><small>{t('contact.incidentHelp')}</small></span></label>
            <label className={kind === 'suggestion' ? 'is-selected' : ''}><input type="radio" name="contact-kind" value="suggestion" checked={kind === 'suggestion'} onChange={() => setKind('suggestion')} /><Lightbulb size={18} /><span><strong>{t('contact.suggestion')}</strong><small>{t('contact.suggestionHelp')}</small></span></label>
          </fieldset>
          <label className="contact-modal__message">{t('contact.message')}<textarea required minLength={10} maxLength={5000} value={message} placeholder={t('contact.placeholder')} onChange={(event) => setMessage(event.target.value)} /></label>
          {error && <p className="form-alert" role="alert">{error}</p>}
          <footer><button className="account-button account-button--secondary" type="button" onClick={onClose}>{t('common.cancel')}</button><button className="account-button account-button--primary" type="submit" disabled={sending || message.trim().length < 10}><Send size={15} />{sending ? t('contact.sending') : t('contact.send')}</button></footer>
        </form>
      </section>
    </div>,
    document.body,
  )
}
