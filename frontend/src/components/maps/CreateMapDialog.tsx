import { Check, MapPinned, Search, X } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { createPortal } from 'react-dom'

import { ApiError } from '../../api/client'
import { getCountries } from '../../api/countries'
import { createMap } from '../../api/maps'
import { useModalFocus } from '../../hooks/useModalFocus'
import type { Country, PoiMap } from '../../types/map'
import { CountryFlag } from './CountryFlag'

interface CreateMapDialogProps {
  onClose: () => void
  onCreated: (poiMap: PoiMap) => void
}

export function CreateMapDialog({ onClose, onCreated }: CreateMapDialogProps) {
  const [query, setQuery] = useState('')
  const [countries, setCountries] = useState<Country[]>([])
  const [countryId, setCountryId] = useState('')
  const [name, setName] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const searchInput = useRef<HTMLInputElement>(null)
  const dialog = useRef<HTMLDivElement>(null)
  useModalFocus({ dialogRef: dialog, initialFocusRef: searchInput, onEscape: onClose })

  useEffect(() => {
    const controller = new AbortController()
    const timeout = window.setTimeout(() => {
      setIsLoading(true)
      void getCountries(query.trim() || undefined, controller.signal)
        .then(setCountries)
        .catch((caught: unknown) => {
          if (!(caught instanceof Error && caught.name === 'AbortError')) setError(caught instanceof Error ? caught.message : 'Catalogue indisponible.')
        })
        .finally(() => { if (!controller.signal.aborted) setIsLoading(false) })
    }, 250)
    return () => { window.clearTimeout(timeout); controller.abort() }
  }, [query])

  const selectCountry = (country: Country) => { setCountryId(country.id); setName(country.name) }
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!countryId) return
    setIsSubmitting(true)
    setError(null)
    try { onCreated(await createMap({ country_id: countryId, name: name.trim() || undefined })) }
    catch (caught) { setError(caught instanceof ApiError && caught.status === 409 ? 'Une carte existe déjà pour ce pays.' : caught instanceof Error ? caught.message : 'Création impossible.') }
    finally { setIsSubmitting(false) }
  }

  return createPortal(
    <div className="cv-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <div ref={dialog} className="create-map-dialog cv-modal" role="dialog" aria-modal="true" aria-labelledby="create-map-title">
        <form onSubmit={(event) => void submit(event)}>
          <header className="create-map-dialog__header">
            <span className="create-map-dialog__header-icon"><MapPinned aria-hidden="true" /></span>
            <div>
              <span>Cartographie</span>
              <h2 id="create-map-title">Créer une carte</h2>
              <p>Choisissez un pays, puis personnalisez le nom de votre carte.</p>
            </div>
            <button type="button" onClick={onClose} aria-label="Fermer"><X aria-hidden="true" /></button>
          </header>
          {error && <p className="form-alert" role="alert">{error}</p>}
          <label className="form-field create-map-dialog__search">
            <span>Rechercher un pays</span>
            <span className="create-map-dialog__input">
              <Search aria-hidden="true" />
              <input
                ref={searchInput}
                type="search"
                value={query}
                placeholder="Nom ou code du pays…"
                onChange={(event) => setQuery(event.target.value)}
              />
            </span>
          </label>
          <div className="country-results" role="listbox" aria-label="Pays disponibles">
            {isLoading ? <p className="country-results__message" role="status">Chargement…</p> : countries.length === 0 ? <p className="country-results__message">Aucun pays trouvé.</p> : countries.map((country) => {
              const selected = country.id === countryId
              return (
                <button className={selected ? 'selected' : ''} type="button" role="option" aria-selected={selected} key={country.id} onClick={() => selectCountry(country)}>
                  <span className="country-results__flag"><CountryFlag countryCode={country.iso_alpha2} fallbackSize={20} /></span>
                  <span className="country-results__identity"><strong>{country.name}</strong><small>{country.iso_alpha2} · {country.iso_alpha3}</small></span>
                  <span className="country-results__selection" aria-hidden="true">{selected && <Check />}</span>
                </button>
              )
            })}
          </div>
          <label className="form-field create-map-dialog__name">
            <span>Nom de la carte</span>
            <input value={name} maxLength={120} required placeholder="Ex. Voyage en Géorgie" onChange={(event) => setName(event.target.value)} />
          </label>
          <div className="dialog-actions">
            <button type="button" onClick={onClose}>Annuler</button>
            <button className="primary-button" type="submit" disabled={!countryId || isSubmitting}>
              <MapPinned aria-hidden="true" />
              {isSubmitting ? 'Création…' : 'Créer la carte'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  )
}
