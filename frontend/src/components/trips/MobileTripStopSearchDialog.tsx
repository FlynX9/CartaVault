import { useEffect, useRef, useState, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import { LoaderCircle, MapPin, Navigation, Search, X } from 'lucide-react'

import { getPlaces } from '../../api/places'
import { GeographicSearch } from '../geocoding/GeographicSearch'
import type { GeocodingResult } from '../../geocoding/types'
import type { PoiMap } from '../../types/map'
import type { PlaceDetails } from '../../types/place'

type SearchMode = 'places' | 'geographic'

interface Props {
  poiMap: PoiMap
  dayLabel: string
  existingPlaceIds: ReadonlySet<string>
  busy: boolean
  onClose: () => void
  onAddPlace: (place: PlaceDetails) => Promise<boolean>
  onAddGeographic: (result: GeocodingResult) => Promise<boolean>
}

export function MobileTripStopSearchDialog({ poiMap, dayLabel, existingPlaceIds, busy, onClose, onAddPlace, onAddGeographic }: Props) {
  const [mode, setMode] = useState<SearchMode>('places')
  const [query, setQuery] = useState('')
  const [places, setPlaces] = useState<PlaceDetails[]>([])
  const [selectedGeographic, setSelectedGeographic] = useState<GeocodingResult | null>(null)
  const [searching, setSearching] = useState(false)
  const [adding, setAdding] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const controller = useRef<AbortController | null>(null)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    input.current?.focus()
    return () => controller.current?.abort()
  }, [])
  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy && !adding) onClose()
    }
    document.addEventListener('keydown', close)
    return () => document.removeEventListener('keydown', close)
  }, [adding, busy, onClose])

  const searchPlaces = async (event: FormEvent) => {
    event.preventDefault()
    const normalized = query.trim()
    if (!normalized) {
      setPlaces([])
      setMessage('Saisissez le nom d’un POI de cette carte.')
      return
    }
    controller.current?.abort()
    const next = new AbortController()
    controller.current = next
    setSearching(true)
    setMessage(null)
    try {
      const found = await getPlaces({ mapId: poiMap.id, q: normalized, limit: 50, offset: 0 }, next.signal)
      if (next.signal.aborted) return
      const located = found.filter((place) => place.latitude !== null && place.longitude !== null)
      setPlaces(located)
      setMessage(located.length ? null : 'Aucun POI localisé ne correspond à cette recherche.')
    } catch (error) {
      if (!next.signal.aborted) setMessage(error instanceof Error ? error.message : 'La recherche des POI est indisponible.')
    } finally {
      if (!next.signal.aborted) setSearching(false)
    }
  }

  const addPlace = async (place: PlaceDetails) => {
    setAdding(true)
    const added = await onAddPlace(place)
    setAdding(false)
    if (!added) setMessage('Cette étape n’a pas pu être ajoutée.')
  }
  const addGeographic = async (result: GeocodingResult) => {
    setAdding(true)
    const added = await onAddGeographic(result)
    setAdding(false)
    if (!added) setMessage('Cette étape n’a pas pu être ajoutée.')
  }

  const disabled = busy || adding
  return createPortal(
    <div className="cv-overlay trip-stop-search-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !disabled) onClose() }}>
      <section className="cv-modal trip-stop-search-dialog" role="dialog" aria-modal="true" aria-labelledby="trip-stop-search-title">
        <header className="trip-stop-search-dialog__header">
          <div>
            <p className="cv-workspace-panel__eyebrow">{dayLabel}</p>
            <h2 id="trip-stop-search-title">Ajouter une étape</h2>
          </div>
          <button className="panel-icon-button" type="button" aria-label="Fermer" disabled={disabled} onClick={onClose}><X size={18} /></button>
        </header>

        <div className="trip-stop-search-dialog__tabs" role="tablist" aria-label="Type de recherche">
          <button type="button" role="tab" aria-selected={mode === 'places'} className={mode === 'places' ? 'is-active' : undefined} onClick={() => setMode('places')}><MapPin size={17} />POI de la carte</button>
          <button type="button" role="tab" aria-selected={mode === 'geographic'} className={mode === 'geographic' ? 'is-active' : undefined} onClick={() => setMode('geographic')}><Navigation size={17} />Adresse ou GPS</button>
        </div>

        <div className="trip-stop-search-dialog__body">
          {message && <p className="trip-stop-search-dialog__message" role="status">{message}</p>}
          {mode === 'places' ? <>
            <form className="trip-stop-search-dialog__form" onSubmit={(event) => void searchPlaces(event)}>
              <label><span className="visually-hidden">Rechercher un POI dans la carte</span><Search size={17} aria-hidden="true" /><input ref={input} type="search" value={query} placeholder="Nom du POI…" onChange={(event) => setQuery(event.target.value)} /></label>
              <button className="primary-button" type="submit" disabled={searching || disabled}>{searching ? <LoaderCircle className="trip-action-spinner" size={17} /> : 'Rechercher'}</button>
            </form>
            <div className="trip-stop-search-dialog__results" role="list" aria-label="POI trouvés">
              {places.map((place) => {
                const alreadyAdded = existingPlaceIds.has(place.id)
                return <button key={place.id} type="button" role="listitem" disabled={disabled || alreadyAdded} onClick={() => void addPlace(place)}>
                  <MapPin size={18} aria-hidden="true" />
                  <span><strong>{place.name}</strong><small>{[place.region, place.categories.find((category) => category.is_primary)?.name].filter(Boolean).join(' · ') || 'POI de la carte'}</small></span>
                  <em>{alreadyAdded ? 'Déjà ajouté' : 'Ajouter'}</em>
                </button>
              })}
            </div>
          </> : <div className="trip-stop-search-dialog__geographic">
            <p>Recherchez une adresse, un lieu ou saisissez des coordonnées GPS.</p>
            <GeographicSearch
              focus={[poiMap.effective_center_latitude, poiMap.effective_center_longitude]}
              countryCode={poiMap.country?.iso_alpha2}
              selected={selectedGeographic}
              canCreate={false}
              tripAddTargetLabel="Ajouter à la journée"
              onSelect={setSelectedGeographic}
              onClear={() => setSelectedGeographic(null)}
              onCreate={() => undefined}
              onAddToTrip={(result) => void addGeographic(result)}
            />
          </div>}
        </div>
      </section>
    </div>,
    document.body,
  )
}
