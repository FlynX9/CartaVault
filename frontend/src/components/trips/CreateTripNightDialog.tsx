import { useCallback, useEffect, useRef, useState, type DragEvent, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import { BedDouble, ClipboardPaste, MapPin, Search, Upload, X } from 'lucide-react'

import type { TripArrivalCreatePayload, TripDepartureCreatePayload, TripNightCreatePayload } from '../../api/trips'
import { getPlaceDetails, getPlaces } from '../../api/places'
import { formatCoordinates } from '../../geocoding/coordinates'
import { placeSearchService } from '../../geocoding/placeSearchService'
import type { GeocodingResult } from '../../geocoding/types'
import type { PlaceDetails } from '../../types/place'
import type { TripNightSourceType } from '../../types/trip'
import { useModalFocus } from '../../hooks/useModalFocus'

interface CommonProps {
  mapId?: string
  mapName?: string
  countryCode?: string
  focus: [number, number]
  initialPlaceId?: string
  initialLocation?: { name: string; latitude: number; longitude: number; address?: string | null; google_place_id?: string | null }
  initialNotes?: string | null
  initialCheckInFromTime?: string | null
  initialCheckInUntilTime?: string | null
  initialCheckOutFromTime?: string | null
  initialCheckOutUntilTime?: string | null
  initialSourceType?: TripNightSourceType
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

type ReservationText = {
  name: string
  address: string
  latitude: number | null
  longitude: number | null
  checkInFromTime: string
  checkInUntilTime: string
  checkOutFromTime: string
  checkOutUntilTime: string
}

function cleanReservationLine(line: string) {
  return line
    .replace(/\[([^\]]+)]\([^)]+\)/g, '$1')
    .replace(/[*_~`#>]/g, '')
    .replace(/^[-•]\s*/, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function reservationSection(lines: string[], label: RegExp) {
  const index = lines.findIndex((line) => label.test(line))
  if (index < 0) return []
  const nextSection = lines.findIndex((line, lineIndex) => lineIndex > index && /^(?:arrivée|départ|adresse|détails de la réservation|paiement)$/i.test(line))
  return lines.slice(index + 1, nextSection < 0 ? undefined : nextSection)
}

function timeRange(lines: string[]) {
  const times = lines.join(' ').match(/\b(?:[01]?\d|2[0-3]):[0-5]\d\b/g)
  return {
    from: times?.[0]?.padStart(5, '0') ?? '',
    until: times?.at(-1)?.padStart(5, '0') ?? '',
  }
}

function normalizedGeocodingText(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function bestReservationResult(results: GeocodingResult[], address: string, countryCode?: string) {
  const expectedTokens = normalizedGeocodingText(address).split(' ').filter((token) => token.length > 1)
  const expectedNumbers = expectedTokens.filter((token) => /^\d+$/.test(token))
  const score = (result: GeocodingResult) => {
    const candidate = normalizedGeocodingText(`${result.name} ${result.formattedAddress} ${result.postalCode ?? ''} ${result.locality ?? ''}`)
    const candidateTokens = candidate.split(' ')
    const matchedTokens = expectedTokens.filter((token) => candidate.includes(token)).length
    const matchedNumbers = expectedNumbers.filter((token) => candidateTokens.includes(token)).length
    const countryMatches = countryCode && result.countryCode
      ? result.countryCode.toLocaleUpperCase() === countryCode.toLocaleUpperCase()
      : null
    return matchedTokens * 2
      + matchedNumbers * 8
      + (countryMatches === true ? 12 : countryMatches === false ? -20 : 0)
      + (result.confidence ?? 0)
  }
  return [...results].sort((left, right) => score(right) - score(left))[0]
}

function extractReservationText(value: string): ReservationText | null {
  const lines = value.replace(/\r/g, '').split('\n').map(cleanReservationLine).filter(Boolean)
  if (!lines.length) return null
  const coordinateMatch = value.match(/(?:lat(?:itude)?\s*[:=]?\s*)?(-?\d{1,2}(?:[.,]\d+)?)\s*[,;]\s*(?:lon(?:gitude)?\s*[:=]?\s*)?(-?\d{1,3}(?:[.,]\d+)?)/i)
  const latitude = coordinateMatch ? Number(coordinateMatch[1].replace(',', '.')) : null
  const longitude = coordinateMatch ? Number(coordinateMatch[2].replace(',', '.')) : null
  const linkedHotel = value.match(/\[([^\]]+)]\(https?:\/\/[^)]*\/hotel\/[^)]*\)/i)?.[1]
  const arrivalIndex = lines.findIndex((line) => /^arrivée$/i.test(line))
  const useful = lines.filter((line) => !/@|https?:\/\/|\b(?:booking|confirmation|réservation|paiement|imprimer|sauvegarder|protégez)\b/i.test(line))
  const name = cleanReservationLine(linkedHotel ?? '')
    || (arrivalIndex > 0 ? lines.slice(0, arrivalIndex).reverse().find((line) => !/^(?:voir|changer|en savoir|adresse)/i.test(line)) : undefined)
    || useful.find((line) => line.length > 2)
    || lines[0]
  const addressSection = reservationSection(lines, /^adresse$/i)
  const address = addressSection.find((line) => /\d{1,5}\s+.+/.test(line))
    ?? useful.find((line) => /\d{1,5}\s+.+|\b(?:rue|avenue|boulevard|road|street|lane|place)\b/i.test(line) && line !== name)
    ?? ''
  const checkIn = timeRange(reservationSection(lines, /^arrivée$/i))
  const checkOut = timeRange(reservationSection(lines, /^départ$/i))
  return {
    name,
    address,
    latitude: Number.isFinite(latitude) ? latitude : null,
    longitude: Number.isFinite(longitude) ? longitude : null,
    checkInFromTime: checkIn.from,
    checkInUntilTime: checkIn.until,
    checkOutFromTime: checkOut.from,
    checkOutUntilTime: checkOut.until,
  }
}

export function CreateTripNightDialog(props: Props) {
  const { mapId, mapName, countryCode, focus, initialPlaceId, initialLocation, onClose } = props
  const isDeparture = props.kind === 'departure'
  const isArrival = props.kind === 'arrival'
  const isStop = props.kind === 'stop'
  const isEditing = props.mode === 'edit'
  const input = useRef<HTMLInputElement>(null)
  const dialog = useRef<HTMLElement>(null)
  const searchController = useRef<AbortController | null>(null)
  const placeController = useRef<AbortController | null>(null)
  const [query, setQuery] = useState('')
  const [reservationText, setReservationText] = useState(
    props.initialSourceType === 'imported_text' ? props.initialNotes ?? '' : '',
  )
  const [checkInFromTime, setCheckInFromTime] = useState(props.initialCheckInFromTime ?? '')
  const [checkInUntilTime, setCheckInUntilTime] = useState(props.initialCheckInUntilTime ?? '')
  const [checkOutFromTime, setCheckOutFromTime] = useState(props.initialCheckOutFromTime ?? '')
  const [checkOutUntilTime, setCheckOutUntilTime] = useState(props.initialCheckOutUntilTime ?? '')
  const [locationSourceType, setLocationSourceType] = useState<TripNightSourceType>(props.initialSourceType ?? (initialPlaceId ? 'place' : 'map'))
  const [results, setResults] = useState<GeocodingResult[]>([])
  const [placeResults, setPlaceResults] = useState<PlaceDetails[]>([])
  const [selectedResult, setSelectedResult] = useState<GeocodingResult | null>(initialLocation ? { id: initialLocation.google_place_id ? `google:${initialLocation.google_place_id}` : 'current-anchor', name: initialLocation.name, formattedAddress: initialLocation.address ?? '', latitude: initialLocation.latitude, longitude: initialLocation.longitude, source: initialLocation.google_place_id ? 'google_places' : 'current' } : null)
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
      if (!controller.signal.aborted) { setSelectedPlace(place); setLocationSourceType('place'); setSelectedResult(null); setResults([]); setPlaceResults([]); setQuery('') }
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
    if (!normalized) { setError(isStop ? 'Saisissez une adresse, des coordonnées ou le nom d’un POI.' : 'Saisissez une adresse ou des coordonnées.'); return }
    searchController.current?.abort(); const controller = new AbortController(); searchController.current = controller
    setLoading(true); setError(null); setSelectedPlace(null); setSelectedResult(null)
    try {
      const [geographicResponse, placesResponse] = await Promise.allSettled([
        placeSearchService.search(normalized, { signal: controller.signal, focus, countryCode, limit: 8 }),
        mapId ? getPlaces({ mapId, q: normalized, limit: 6 }, controller.signal) : Promise.resolve([]),
      ])
      if (controller.signal.aborted) return
      const found = geographicResponse.status === 'fulfilled' ? geographicResponse.value : []
      const foundPlaces = placesResponse.status === 'fulfilled'
        ? placesResponse.value.filter((place) => place.latitude !== null && place.longitude !== null)
        : []
      setResults(found)
      setPlaceResults(foundPlaces)
      if (!found.length && !foundPlaces.length) {
        setError(geographicResponse.status === 'rejected' && geographicResponse.reason instanceof Error ? geographicResponse.reason.message : 'Aucun emplacement ou POI fiable trouvé pour cette recherche.')
      }
      if (geographicResponse.status === 'rejected' && placesResponse.status === 'rejected') throw geographicResponse.reason
    } catch (caught) {
      if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : 'La recherche géographique est indisponible.')
    } finally { if (!controller.signal.aborted) setLoading(false) }
  }

  const analyzeReservation = async () => {
    const extracted = extractReservationText(reservationText)
    if (!extracted) { setError('Collez une confirmation ou des coordonnées à analyser.'); return }
    setLoading(true); setError(null); setSelectedPlace(null); setResults([]); setPlaceResults([])
    setCheckInFromTime(extracted.checkInFromTime)
    setCheckInUntilTime(extracted.checkInUntilTime)
    setCheckOutFromTime(extracted.checkOutFromTime)
    setCheckOutUntilTime(extracted.checkOutUntilTime)
    try {
      if (extracted.latitude !== null && extracted.longitude !== null) {
        setSelectedResult({ id: 'reservation-coordinates', name: extracted.name, formattedAddress: extracted.address, latitude: extracted.latitude, longitude: extracted.longitude, source: 'reservation' }); setLocationSourceType('imported_text')
        setQuery(extracted.address || extracted.name)
        return
      }
      const lookup = extracted.address || extracted.name
      const found = await placeSearchService.search(`${extracted.name}, ${lookup}`, { countryCode, limit: 10 })
      if (!found.length) {
        setError('Aucun emplacement fiable n’a pu être déduit de ce texte. Vérifiez l’adresse ou ajoutez des coordonnées.')
        return
      }
      const geocoded = bestReservationResult(found, extracted.address || extracted.name, countryCode)
      const preferred = { ...geocoded, name: extracted.name || geocoded.name, formattedAddress: extracted.address || geocoded.formattedAddress }
      setSelectedResult(preferred); setLocationSourceType('imported_text'); setQuery(lookup)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'L’analyse de la confirmation est indisponible.')
    } finally { setLoading(false) }
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
        stop_type: 'free_location',
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
        source_type: selectedPlace ? 'place' : locationSourceType,
        google_place_id: selectedResult?.source === 'google_places' && selectedResult.id.startsWith('google:')
          ? selectedResult.id.slice('google:'.length)
          : null,
        notes: String(data.get('notes') ?? '').trim()
          || (locationSourceType === 'imported_text' ? reservationText.trim() : '')
          || undefined,
        check_in_from_time: String(data.get('check_in_from_time') ?? '') || undefined,
        check_in_until_time: String(data.get('check_in_until_time') ?? '') || undefined,
        check_out_from_time: String(data.get('check_out_from_time') ?? '') || undefined,
        check_out_until_time: String(data.get('check_out_until_time') ?? '') || undefined,
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
    <section ref={dialog} className={`create-trip-night-dialog cv-modal${isStop ? ' create-trip-night-dialog--stop' : ''}`} role="dialog" aria-modal="true" aria-labelledby="create-trip-night-title">
      <form onSubmit={(event) => void submit(event)}>
        <header>{isStop && <span className="create-trip-night-dialog__header-icon" aria-hidden="true"><MapPin size={21} /></span>}<div><p className="cv-workspace-panel__eyebrow">{isStop ? 'Étape libre' : isDeparture ? 'Départ' : isArrival ? 'Arrivée' : 'Étape de nuit'}</p><h2 id="create-trip-night-title">{isStop ? 'Ajouter un lieu libre' : isEditing ? (isDeparture ? 'Modifier le point de départ' : isArrival ? 'Modifier le point d’arrivée' : 'Modifier l’hébergement') : (isDeparture ? 'Ajouter le point de départ' : isArrival ? 'Ajouter le point d’arrivée' : 'Ajouter un hébergement')}</h2><span>{mapName ? `Recherchez une adresse ou un POI de la carte ${mapName}` : isStop ? 'Recherchez une adresse, des coordonnées ou un POI' : isDeparture ? 'Point de départ du premier jour' : isArrival ? 'Destination du dernier jour' : 'Hébergement entre deux journées'}</span></div><button className="panel-icon-button" type="button" aria-label="Fermer" disabled={busy} onClick={onClose}><X size={18} /></button></header>
        <div className="create-trip-night-dialog__body">
          {error && <p className="form-alert" role="alert">{error}</p>}
          <section className="trip-night-location"><h3>{isStop ? 'Rechercher un lieu' : 'Emplacement'}</h3><div className="trip-night-search"><label><span className="visually-hidden">{isStop ? 'Adresse, coordonnées GPS ou POI' : 'Adresse ou coordonnées GPS'}</span><Search size={16} /><input ref={input} type="search" value={query} placeholder={isStop ? 'Adresse, coordonnées GPS ou nom d’un POI…' : 'Adresse ou coordonnées GPS…'} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); void search() } }} /></label><button type="button" disabled={loading} onClick={() => void search()}>{loading ? 'Recherche…' : 'Rechercher'}</button></div>
            {(placeResults.length > 0 || results.length > 0) && <div className="trip-night-results" role="listbox" aria-label="Résultats de recherche">{placeResults.map((place) => <button className="trip-night-result trip-night-result--poi" key={`place-${place.id}`} type="button" role="option" aria-selected={selectedPlace?.id === place.id} onClick={() => { setSelectedPlace(place); setLocationSourceType('place'); setSelectedResult(null); setResults([]); setPlaceResults([]); setQuery(place.name) }}><MapPin size={15} /><span><strong>{place.name}</strong><small>POI CartaVault · {place.region ?? place.map.name}</small></span><em>POI</em></button>)}{results.map((result) => <button className="trip-night-result" key={`geo-${result.id}`} type="button" role="option" aria-selected={selectedResult?.id === result.id} onClick={() => { setSelectedResult(result); setLocationSourceType('map'); setSelectedPlace(null); setResults([]); setPlaceResults([]); setQuery(result.formattedAddress) }}><MapPin size={15} /><span><strong>{result.name}</strong><small>{result.formattedAddress} · {formatCoordinates(result.latitude, result.longitude)}</small></span><em>{result.source === 'google_places' ? 'Google' : 'Adresse'}</em></button>)}</div>}
            {!isStop && <div className={`trip-night-drop${selectedPlace ? ' selected' : ''}`} onDragOver={(event) => event.preventDefault()} onDrop={drop}><Upload size={19} /><span><strong>Ou glissez un POI ici</strong><small>Depuis le panneau Lieux</small></span></div>}
            {!isStop && !isDeparture && !isArrival && <section className="trip-night-reservation"><h4><ClipboardPaste size={14} />Coller une confirmation</h4><textarea aria-label="Texte de confirmation de réservation" value={reservationText} onChange={(event) => setReservationText(event.target.value)} rows={4} maxLength={10000} placeholder="Collez une réservation d’hôtel ou un e-mail : le nom, l’adresse ou les coordonnées seront proposés." /><div><small>Les coordonnées GPS sont détectées directement. Sinon, CartaVault recherche l’adresse extraite.</small><button type="button" disabled={loading || !reservationText.trim()} onClick={() => void analyzeReservation()}>Analyser le texte</button></div></section>}
            {selectionName && <article className="trip-night-selection">{isDeparture || isArrival || isStop ? <MapPin size={20} /> : <BedDouble size={20} />}<span><strong>{selectionName}</strong><small>{selectionAddress}</small><small>{selectionCoordinates}</small></span><button type="button" onClick={() => { setSelectedPlace(null); setSelectedResult(null); setQuery('') }}>Changer</button></article>}
          </section>
          {!selectedPlace && selectedResult && <label className="form-field"><span>{isStop ? 'Nom du lieu' : isDeparture ? 'Nom du point de départ' : isArrival ? 'Nom du point d’arrivée' : 'Nom de l’hébergement'}</span><input name="name" defaultValue={selectedResult.name} maxLength={255} /></label>}
          {!isStop && !isArrival && (isDeparture ? <label className="form-field"><span>Heure de départ</span><input name="departure_time" type="time" defaultValue={props.initialDepartureTime ?? ''} /></label> : <div className="create-trip-night-dialog__stay-times"><fieldset><legend>Arrivée</legend><label className="form-field"><span>À partir de</span><input name="check_in_from_time" type="time" value={checkInFromTime} onChange={(event) => setCheckInFromTime(event.target.value)} /></label><label className="form-field"><span>Jusqu’à</span><input name="check_in_until_time" type="time" value={checkInUntilTime} onChange={(event) => setCheckInUntilTime(event.target.value)} /></label></fieldset><fieldset><legend>Départ</legend><label className="form-field"><span>À partir de</span><input name="check_out_from_time" type="time" value={checkOutFromTime} onChange={(event) => setCheckOutFromTime(event.target.value)} /></label><label className="form-field"><span>Jusqu’à</span><input name="check_out_until_time" type="time" value={checkOutUntilTime} onChange={(event) => setCheckOutUntilTime(event.target.value)} /></label></fieldset></div>)}
          {!isStop && <label className="form-field"><span>Notes</span><textarea name="notes" rows={3} maxLength={10000} defaultValue={props.initialNotes ?? ''} placeholder="Réservation, consignes, contact…" /></label>}
        </div>
        <footer className="dialog-actions"><button className="secondary-button" type="button" disabled={busy} onClick={onClose}>Annuler</button><button className="primary-button" data-cv-save={isEditing ? 'true' : undefined} type="submit" disabled={busy || (!selectedPlace && !selectedResult)}>{isDeparture || isArrival || isStop ? <MapPin size={16} /> : <BedDouble size={16} />}{busy ? 'Enregistrement…' : isStop ? 'Ajouter l’étape' : isEditing ? 'Enregistrer' : isDeparture ? 'Ajouter le départ' : isArrival ? 'Ajouter l’arrivée' : 'Ajouter la nuit'}</button></footer>
      </form>
    </section>
  </div>, document.body)
}
