import { useEffect, useRef, useState, type FormEvent } from 'react'
import { createPortal } from 'react-dom'

import { ApiError } from '../../api/client'
import { getCountries } from '../../api/countries'
import { createMap } from '../../api/maps'
import { useModalFocus } from '../../hooks/useModalFocus'
import type { Country, PoiMap } from '../../types/map'

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
          <header><h2 id="create-map-title">Créer une carte</h2><button type="button" onClick={onClose} aria-label="Fermer">×</button></header>
          {error && <p className="form-alert" role="alert">{error}</p>}
          <label className="form-field"><span>Rechercher un pays</span><input ref={searchInput} type="search" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
          <div className="country-results" role="listbox" aria-label="Pays disponibles">
            {isLoading ? <p role="status">Chargement…</p> : countries.map((country) => <button className={country.id === countryId ? 'selected' : ''} type="button" role="option" aria-selected={country.id === countryId} key={country.id} onClick={() => selectCountry(country)}><strong>{country.name}</strong><span>{country.iso_alpha2} · {country.iso_alpha3}</span></button>)}
          </div>
          <label className="form-field"><span>Nom de la carte</span><input value={name} maxLength={120} required onChange={(event) => setName(event.target.value)} /></label>
          <div className="dialog-actions"><button type="button" onClick={onClose}>Annuler</button><button className="primary-button" type="submit" disabled={!countryId || isSubmitting}>{isSubmitting ? 'Création…' : 'Créer la carte'}</button></div>
        </form>
      </div>
    </div>,
    document.body,
  )
}
