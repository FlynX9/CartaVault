import { useCallback, useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { CarFront, Check, FileImage, FileText, LoaderCircle, Map as MapIcon, QrCode, ShieldCheck, X } from 'lucide-react'

import type { TripPdfExportOptions, TripPdfNavigationProvider } from '../../api/trips'
import { useModalFocus } from '../../hooks/useModalFocus'
import { GoogleMapsIcon } from '../common/GoogleMapsIcon'

const DEFAULT_TRIP_PDF_EXPORT_OPTIONS: TripPdfExportOptions = {
  include_overview_map: true,
  include_place_images: true,
  include_navigation_qr_codes: true,
  navigation_providers: ['google_maps'],
}

interface Props {
  trigger: HTMLElement | null
  onClose: () => void
  onExport: (options: TripPdfExportOptions) => Promise<void>
}

export function TripPdfExportDialog({ trigger, onClose, onExport }: Props) {
  const titleId = useId()
  const descriptionId = useId()
  const dialogRef = useRef<HTMLElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const triggerRef = useRef<HTMLElement>(trigger)
  const [options, setOptions] = useState(DEFAULT_TRIP_PDF_EXPORT_OPTIONS)
  const [loading, setLoading] = useState(false)
  const loadingRef = useRef(false)
  const [error, setError] = useState<string | null>(null)
  loadingRef.current = loading
  const close = useCallback(() => { if (!loadingRef.current) onClose() }, [onClose])
  useModalFocus({ dialogRef, initialFocusRef: closeButtonRef, triggerRef, onEscape: close })
  useEffect(() => {
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = overflow }
  }, [])

  const toggle = (key: 'include_overview_map' | 'include_place_images' | 'include_navigation_qr_codes') => {
    setOptions((current) => ({ ...current, [key]: !current[key] }))
  }
  const toggleProvider = (provider: TripPdfNavigationProvider) => setOptions((current) => ({
    ...current,
    navigation_providers: current.navigation_providers.includes(provider)
      ? current.navigation_providers.filter((item) => item !== provider)
      : [...current.navigation_providers, provider],
  }))
  const invalid = options.include_navigation_qr_codes && options.navigation_providers.length === 0
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (loading) return
    setLoading(true)
    setError(null)
    try {
      await onExport(options)
      onClose()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'L’export PDF n’a pas pu être généré.')
      setLoading(false)
    }
  }

  return createPortal(
    <div className="trip-pdf-export-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) close() }}>
      <section ref={dialogRef} className="trip-pdf-export-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId} aria-busy={loading}>
        <header className="trip-pdf-export-dialog__header">
          <span className="trip-pdf-export-dialog__icon" aria-hidden="true"><FileText size={21} /></span>
          <div><p>DOCUMENT DE VOYAGE</p><h2 id={titleId}>Options d’export</h2><span id={descriptionId}>Personnalisez le contenu et les liens de navigation inclus dans le document.</span></div>
          <button ref={closeButtonRef} className="panel-icon-button" type="button" aria-label="Fermer les options d’export" disabled={loading} onClick={close}><X size={15} /></button>
        </header>
        <form onSubmit={submit}>
          <div className="trip-pdf-export-dialog__content">
            {error && <p className="form-alert" role="alert">{error}</p>}
            <aside className="trip-pdf-export-notice" aria-label="Confidentialité de l’export">
              <span aria-hidden="true"><ShieldCheck size={21} /></span>
              <div>
                <strong>Export configurable et privé</strong>
                <p>Le fichier est généré pour vous. Aucun appel aux API Google Maps ou Waze n’est effectué.</p>
              </div>
            </aside>
            <fieldset className="trip-pdf-export-section">
              <legend>Contenu du document</legend>
              <ExportToggle icon={<MapIcon size={18} />} label="Inclure la carte générale" description="Ajoute la vue d’ensemble du voyage et ses principaux tracés." checked={options.include_overview_map} onChange={() => toggle('include_overview_map')} />
              <ExportToggle icon={<FileImage size={18} />} label="Inclure les photos des lieux" description="Ajoute la photo principale de chaque lieu lorsqu’elle est disponible." checked={options.include_place_images} onChange={() => toggle('include_place_images')} />
              <ExportToggle icon={<QrCode size={18} />} label="Inclure les QR codes de navigation" description="Permet d’ouvrir chaque étape dans l’application de navigation choisie." checked={options.include_navigation_qr_codes} onChange={() => toggle('include_navigation_qr_codes')} />
            </fieldset>
            {options.include_navigation_qr_codes && <fieldset className="trip-pdf-export-section trip-pdf-export-providers">
              <legend>Applications de navigation</legend>
              <p>Les coordonnées restent dans le PDF : aucun appel aux API Google Maps ou Waze n’est effectué.</p>
              <ProviderCard provider="google_maps" selected={options.navigation_providers.includes('google_maps')} icon={<GoogleMapsIcon size={22} />} label="Google Maps" description="Ouvre les coordonnées du lieu dans Google Maps." onToggle={toggleProvider} />
              <ProviderCard provider="waze" selected={options.navigation_providers.includes('waze')} icon={<CarFront size={19} />} label="Waze" description="Ouvre directement la navigation vers le lieu dans Waze." onToggle={toggleProvider} />
              {invalid && <p className="trip-pdf-export-provider-error" role="alert">Sélectionnez au moins une application de navigation.</p>}
              <aside className="trip-pdf-export-qr-note" aria-label="Information sur les QR codes">
                <span aria-hidden="true"><QrCode size={20} /></span>
                <div><strong>QR codes enrichis</strong><p>Chaque code indique clairement l’application de navigation sélectionnée.</p></div>
              </aside>
            </fieldset>}
          </div>
          <footer className="trip-pdf-export-dialog__footer">
            <button type="button" disabled={loading} onClick={close}>Annuler</button>
            <button className="primary" type="submit" disabled={loading || invalid}>{loading ? <><LoaderCircle className="trip-action-spinner" size={15} aria-hidden="true" />Génération…</> : <><FileText size={15} aria-hidden="true" />Exporter le PDF</>}</button>
          </footer>
        </form>
      </section>
    </div>,
    document.body,
  )
}

function ExportToggle({ icon, label, description, checked, onChange }: { icon: ReactNode; label: string; description: string; checked: boolean; onChange: () => void }) {
  return <label className="trip-pdf-export-toggle"><span className="trip-pdf-export-toggle__icon" aria-hidden="true">{icon}</span><span><strong>{label}</strong><small>{description}</small></span><input type="checkbox" checked={checked} onChange={onChange} /><i aria-hidden="true" /></label>
}

function ProviderCard({ provider, selected, icon, label, description, onToggle }: { provider: TripPdfNavigationProvider; selected: boolean; icon: ReactNode; label: string; description: string; onToggle: (provider: TripPdfNavigationProvider) => void }) {
  return <label className={`trip-pdf-export-provider${selected ? ' is-selected' : ''}`}><input type="checkbox" name="trip-pdf-navigation-provider" value={provider} checked={selected} onChange={() => onToggle(provider)} /><span className="trip-pdf-export-provider__icon" aria-hidden="true">{icon}</span><span><strong>{label}</strong><small>{description}</small></span><i aria-hidden="true">{selected && <Check size={12} strokeWidth={3} />}</i></label>
}
