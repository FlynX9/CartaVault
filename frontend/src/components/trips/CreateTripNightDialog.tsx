import { useCallback, useEffect, useRef, useState, type DragEvent, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import { BedDouble, MapPin, Search, Upload, X } from 'lucide-react'

import type { TripArrivalCreatePayload, TripDepartureCreatePayload, TripNightCreatePayload } from '../../api/trips'
import { getPlaceDetails } from '../../api/places'
import { formatCoordinates } from '../../geocoding/coordinates'
import { geocodingService } from '../../geocoding/geocodingService'
import type { GeocodingResult } from '../../geocoding/types'
import type { PlaceDetails } from '../../types/place'
import { useModalFocus } from '../../hooks/useModalFocus'

interface CommonProps {
  mapName?: string
  countryCode?: string
  focus: [number, number]
  initialPlaceId?: string
  initialLocation?: { name: string; latitude: number; longitude: number; address?: string | null }
  initialNotes?: string | null
  initialCheckInTime?: string | null
  initialCheckOutTime?: string | null
  initialDepartureTime?: string | null
  mode?: 'create' | 'edit'
  onClose: () => void
}

interface NightProps extends CommonProps {
  kind?: 'night'
  previousDayId: string
  nextDayId: string
  onCreate: (payload: TripNightCreatePayload) => Promise<void>
}

interface DepartureProps extends CommonProps {
  kind: 'departure'
  onCreate: (payload: TripDepartureCreatePayload) => Promise<void>
}

interface ArrivalProps extends CommonProps {
  kind: 'arrival'
  onCreate: (payload: TripArrivalCreatePayload) => Promise<void>
}

export interface TripFreeStopPayload {
  place_id?: string
  stop_type: 'free_location' | 'restaurant' | 'parking' | 'station' | 'airport' | 'other'
  name?: string
  latitude?: number
  longitude?: number
  address?: string
  notes?: string
  visit_duration_minutes: number
}

interface StopProps extends CommonProps {
  kind: 'stop'
  onCreate: (payload: TripFreeStopPayload) => Promise<void>
}

type Props = NightProps | DepartureProps | ArrivalProps | StopProps

export function CreateTripNightDialog(props: Props) {
  const { mapName, countryCode, focus, initialPlaceId, initialLocation, onClose } = props
  const isDeparture = props.kind === 'departure'
  const isArrival = props.kind === 'arrival'
  const isStop = props.kind === 'stop'
  const isEditing = props.mode === 'edit'
  const input = useRef<HTMLInputElement>(null)
  const dialog = useRef<HTMLElement>(null)
  const searchController = useRef<AbortController | null>(null)
  const placeController = useRef<AbortController | null>(null)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<GeocodingResult[]>([])
  const [selectedResult, setSelectedResult] = useState<GeocodingResult | null>(initialLocation ? { id: 'current-anchor', name: initialLocation.name, formattedAddress: initialLocation.address ?? '', latitude: initialLocation.latitude, longitude: initialLocation.longitude, source: 'current' } : null)
  const [selectedPlace, setSelectedPlace] = useState<PlaceDetails | null>(null)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useModalFocus({ dialogRef: dialog, initialFocusRef: input, onEscape: busy ? undefined : onClose })

  const selectPlace = useCallback(async (placeId: string) => {
    placeController.current?.abort(); const controller = new AbortController(); placeController.current = controller
    setLoading(true); setError(null)
    try {
      const place = await getPlaceDetails(placeId, controller.signal)
      if (place.latitude === null || place.longitude === null) throw new Error('Ce POI ne possède pas de coordonnées utilisables.')
      if (!controller.signal.aborted) { setSelectedPlace(place); setSelectedResult(null); setResults([]); setQuery('') }
    } catch (caught) {
      if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : 'Impossible de charger ce POI.')
    } finally { if (!controller.signal.aborted) setLoading(false) }
  }, [])

  useEffect(() => {
    return () => { searchController.current?.abort(); placeController.current?.abort() }
  }, [])
  useEffect(() => { if (initialPlaceId) void selectPlace(initialPlaceId) }, [initialPlaceId, selectPlace])

  const search = async () => {
    const normalized = query.trim()
    if (!normalized) { setError('Saisissez une adresse ou des coordonnées.'); return }
    searchController.current?.abort(); const controller = new AbortController(); searchController.current = controller
    setLoading(true); setError(null); setSelectedPlace(null)
    try {
      const found = await geocodingService.search(normalized, { signal: controller.signal, focus, countryCode, limit: 6 })
      if (!controller.signal.aborted) { setResults(found); if (!found.length) setError('Aucun emplacement trouvé.') }
    } catch (caught) {
      if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : 'La recherche géographique est indisponible.')
    } finally { if (!controller.signal.aborted) setLoading(false) }
  }

  const drop = (event: DragEvent) => {
    event.preventDefault(); const value = event.dataTransfer.getData('text/plain')
    if (value.startsWith('place:')) void selectPlace(value.slice(6))
    else setError('Déposez un POI depuis le panneau Lieux.')
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const data = new FormData(event.currentTarget)
    if (!selectedPlace && !selectedResult) { setError('Choisissez une adresse, des coordonnées ou un POI.'); return }
    setBusy(true); setError(null)
    try {
      const location = selectedPlace ? { place_id: selectedPlace.id } : {
          name: String(data.get('name') ?? '').trim() || selectedResult!.name,
          latitude: selectedResult!.latitude,
          longitude: selectedResult!.longitude,
          address: selectedResult!.formattedAddress,
        }
      if (props.kind === 'stop') await props.onCreate({
        ...location,
        stop_type: String(data.get('stop_type') ?? 'free_location') as TripFreeStopPayload['stop_type'],
        notes: String(data.get('notes') ?? '').trim() || undefined,
        visit_duration_minutes: 30,
      })
      else if (props.kind === 'departure') await props.onCreate({
        ...location,
        notes: String(data.get('notes') ?? '').trim() || undefined,
        departure_time: String(data.get('departure_time') ?? '') || undefined,
      })
      else if (props.kind === 'arrival') await props.onCreate({
        ...location,
        notes: String(data.get('notes') ?? '').trim() || undefined,
      })
      else await props.onCreate({
        previous_day_id: props.previousDayId,
        next_day_id: props.nextDayId,
        ...location,
        notes: String(data.get('notes') ?? '').trim() || undefined,
        check_in_time: String(data.get('check_in_time') ?? '') || undefined,
        check_out_time: String(data.get('check_out_time') ?? '') || undefined,
      })
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : `Impossible d’ajouter ${isStop ? 'ce lieu' : isDeparture ? 'ce départ' : isArrival ? 'cette arrivée' : 'cette nuit'}.`)
      setBusy(false)
    }
  }

  const selectionName = selectedPlace?.name ?? selectedResult?.name
  const selectionAddress = selectedPlace ? `POI · ${selectedPlace.map.name}` : selectedResult?.formattedAddress
  const selectionCoordinates = selectedPlace && selectedPlace.latitude !== null && selectedPlace.longitude !== null
    ? formatCoordinates(selectedPlace.latitude, selectedPlace.longitude)
    : selectedResult ? formatCoordinates(selectedResult.latitude, selectedResult.longitude) : null

  return createPortal(<div className="cv-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose() }}>
    <section ref={dialog} className="create-trip-night-dialog cv-modal" role="dialog" aria-modal="true" aria-labelledby="create-trip-night-title">
      <form onSubmit={(event) => void submit(event)}>
        <header><div><p className="cv-workspace-panel__eyebrow">{isStop ? 'Étape libre' : isDeparture ? 'Départ' : isArrival ? 'Arrivée' : 'Étape de nuit'}</p><h2 id="create-trip-night-title">{isStop ? 'Ajouter un lieu libre' : isEditing ? (isDeparture ? 'Modifier le point de départ' : isArrival ? 'Modifier le point d’arrivée' : 'Modifier l’hébergement') : (isDeparture ? 'Ajouter le point de départ' : isArrival ? 'Ajouter le point d’arrivée' : 'Ajouter un hébergement')}</h2><span>{mapName ? `Sortie sur la carte ${mapName}` : isStop ? 'Nouvelle étape de la journée' : isDeparture ? 'Point de départ du premier jour' : isArrival ? 'Destination du dernier jour' : 'Hébergement entre deux journées'}</span></div><button className="panel-icon-button" type="button" aria-label="Fermer" disabled={busy} onClick={onClose}><X size={18} /></button></header>
        <div className="create-trip-night-dialog__body">
          {error && <p className="form-alert" role="alert">{error}</p>}
          <section className="trip-night-location"><h3>Emplacement</h3><div className="trip-night-search"><label><span className="visually-hidden">Adresse ou coordonnées GPS</span><Search size={16} /><input ref={input} type="search" value={query} placeholder="Adresse ou coordonnées GPS…" onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); void search() } }} /></label><button type="button" disabled={loading} onClick={() => void search()}>{loading ? 'Recherche…' : 'Rechercher'}</button></div>
            {results.length > 0 && <div className="trip-night-results" role="listbox" aria-label="Résultats géographiques">{results.map((result) => <button key={result.id} type="button" role="option" aria-selected={selectedResult?.id === result.id} onClick={() => { setSelectedResult(result); setSelectedPlace(null); setResults([]); setQuery(result.formattedAddress) }}><MapPin size={15} /><span><strong>{result.name}</strong><small>{result.formattedAddress} · {formatCoordinates(result.latitude, result.longitude)}</small></span></button>)}</div>}
            <div className={`trip-night-drop${selectedPlace ? ' selected' : ''}`} onDragOver={(event) => event.preventDefault()} onDrop={drop}><Upload size={19} /><span><strong>Ou glissez un POI ici</strong><small>Depuis le panneau Lieux</small></span></div>
            {selectionName && <article className="trip-night-selection">{isDeparture || isArrival || isStop ? <MapPin size={20} /> : <BedDouble size={20} />}<span><strong>{selectionName}</strong><small>{selectionAddress}</small><small>{selectionCoordinates}</small></span><button type="button" onClick={() => { setSelectedPlace(null); setSelectedResult(null); setQuery('') }}>Changer</button></article>}
          </section>
          {!selectedPlace && selectedResult && <label className="form-field"><span>{isStop ? 'Nom du lieu' : isDeparture ? 'Nom du point de départ' : isArrival ? 'Nom du point d’arrivée' : 'Nom de l’hébergement'}</span><input name="name" defaultValue={selectedResult.name} maxLength={255} /></label>}
          {isStop && <label className="form-field"><span>Type d’étape</span><select name="stop_type" defaultValue="free_location"><option value="free_location">Lieu libre</option><option value="restaurant">Restaurant</option><option value="parking">Parking</option><option value="station">Station</option><option value="airport">Aéroport</option><option value="other">Autre</option></select></label>}
          {!isStop && !isArrival && (isDeparture ? <label className="form-field"><span>Heure de départ</span><input name="departure_time" type="time" defaultValue={props.initialDepartureTime ?? ''} /></label> : <div className="create-trip-night-dialog__times"><label className="form-field"><span>Arrivée</span><input name="check_in_time" type="time" defaultValue={props.initialCheckInTime ?? ''} /></label><label className="form-field"><span>Départ</span><input name="check_out_time" type="time" defaultValue={props.initialCheckOutTime ?? ''} /></label></div>)}
          <label className="form-field"><span>Notes</span><textarea name="notes" rows={3} maxLength={10000} defaultValue={props.initialNotes ?? ''} placeholder="Réservation, consignes, contact…" /></label>
        </div>
        <footer className="dialog-actions"><button className="secondary-button" type="button" disabled={busy} onClick={onClose}>Annuler</button><button className="primary-button" type="submit" disabled={busy || (!selectedPlace && !selectedResult)}>{isDeparture || isArrival || isStop ? <MapPin size={16} /> : <BedDouble size={16} />}{busy ? 'Enregistrement…' : isStop ? 'Ajouter l’étape' : isEditing ? 'Enregistrer' : isDeparture ? 'Ajouter le départ' : isArrival ? 'Ajouter l’arrivée' : 'Ajouter la nuit'}</button></footer>
      </form>
    </section>
  </div>, document.body)
}
