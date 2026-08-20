import { useEffect, useRef, useState, type FocusEvent, type FormEvent } from 'react'
import { Search } from 'lucide-react'

import { formatCoordinates } from '../../geocoding/coordinates'
import { placeSearchService } from '../../geocoding/placeSearchService'
import type { GeocodingResult } from '../../geocoding/types'

interface Props {
  focus: [number, number]
  expanded?: boolean
  onExpandedChange?: (expanded: boolean) => void
  countryCode?: string
  selected: GeocodingResult | null
  canCreate?: boolean
  tripAddTargetLabel?: string | null
  onSelect: (result: GeocodingResult) => void
  onClear: () => void
  onCreate: (result: GeocodingResult) => void
  onAddToTrip?: (result: GeocodingResult) => void
}

export function GeographicSearch({ focus, expanded: controlledExpanded, onExpandedChange, countryCode, selected, canCreate = true, tripAddTargetLabel = null, onSelect, onClear, onCreate, onAddToTrip }: Props) {
  const [uncontrolledExpanded, setUncontrolledExpanded] = useState(false)
  const expanded = controlledExpanded ?? uncontrolledExpanded
  const setExpanded = onExpandedChange ?? setUncontrolledExpanded
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<GeocodingResult[]>([])
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const controller = useRef<AbortController | null>(null)
  const section = useRef<HTMLElement>(null)
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => () => controller.current?.abort(), [])
  useEffect(() => {
    const closeFromOutside = (event: PointerEvent) => {
      if (section.current?.contains(event.target as Node)) return
      setExpanded(false)
      setOpen(false)
    }
    document.addEventListener('pointerdown', closeFromOutside)
    return () => document.removeEventListener('pointerdown', closeFromOutside)
  }, [])

  const search = async () => {
    const normalized = query.trim()
    if (!normalized) { setMessage('Saisissez une adresse ou des coordonnées.'); setResults([]); setOpen(true); return }
    controller.current?.abort()
    const next = new AbortController(); controller.current = next; setLoading(true); setMessage(null); setOpen(true)
    try {
      const found = await placeSearchService.search(normalized, { signal: next.signal, focus, countryCode, limit: 8 })
      if (!next.signal.aborted) { setResults(found); setActiveIndex(0); if (!found.length) setMessage('Aucune adresse trouvée.') }
    } catch (error) {
      if (!next.signal.aborted) setMessage(error instanceof Error ? error.message : 'Le service de recherche géographique est indisponible.')
    } finally { if (!next.signal.aborted) setLoading(false) }
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!expanded) {
      setExpanded(true)
      requestAnimationFrame(() => input.current?.focus())
      return
    }
    void search()
  }
  const select = (result: GeocodingResult) => { onSelect(result); setOpen(false); setResults([]); input.current?.focus() }
  const handleBlur = (event: FocusEvent<HTMLElement>) => {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return
    setOpen(false)
  }
  const legacyMode = controlledExpanded === undefined
  return <section ref={section} className={`geographic-search${expanded ? ' is-pinned-open' : ''}`} aria-label="Recherche géographique" onBlur={handleBlur}>
    {legacyMode && <form className="geographic-search__legacy-form" onSubmit={(event) => { event.preventDefault(); setExpanded(true); void search() }}><label><span className="visually-hidden">Rechercher une adresse ou des coordonnées</span><input ref={input} type="search" value={query} onFocus={() => setExpanded(true)} onChange={(event) => setQuery(event.target.value)} /></label><button type="submit" aria-label="Lancer la recherche géographique"><Search size={18} aria-hidden="true" /><span className="geographic-search__trigger-label">Rechercher</span></button></form>}
    <button type="button" className="geographic-search__toggle" aria-expanded={expanded} aria-label="Recherche cartographique" onClick={() => setExpanded(!expanded)}><Search size={18} aria-hidden="true" /><span>Recherche</span></button>
    {expanded && <div className="geographic-search__panel">{!legacyMode && <form onSubmit={submit}><label><span className="visually-hidden">Rechercher une adresse ou des coordonnées</span><input ref={input} type="search" value={query} placeholder="Rechercher une adresse ou des coordonnées" onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === 'Escape') { setOpen(false); setResults([]); setExpanded(false) } if (event.key === 'Enter') { event.preventDefault(); void search() } if (event.key === 'ArrowDown' && results.length) { event.preventDefault(); setActiveIndex((value) => Math.min(value + 1, results.length - 1)) } if (event.key === 'ArrowUp' && results.length) { event.preventDefault(); setActiveIndex((value) => Math.max(value - 1, 0)) } }} aria-expanded={open} aria-controls="geocoding-results" /></label></form>}
      <div className="geographic-search__examples"><strong>Exemples de recherche</strong><p>123 Rue de la Paix, Paris, France</p><p>48.8566, 2.3522</p><p>Place de la Concorde, Paris</p><small>Entrez une adresse complète ou des coordonnées GPS (lat, lon).</small></div>
    {loading && <p className="geocoding-status" role="status">Recherche géographique…</p>}
    {open && !loading && <div className="geocoding-results" id="geocoding-results" role="listbox" aria-label="Résultats géographiques">{message && <p role="status">{message}</p>}{results.map((result, index) => <button key={result.id} type="button" role="option" aria-selected={index === activeIndex} className={index === activeIndex ? 'active' : undefined} onMouseEnter={() => setActiveIndex(index)} onClick={() => select(result)}><strong>{result.name}</strong><span>{result.formattedAddress}</span><small>{result.layer ?? 'lieu'} · {result.countryName ?? result.countryCode ?? 'Monde'} · {formatCoordinates(result.latitude, result.longitude)}</small></button>)}</div>}
    {selected && <aside className="geocoding-selection" aria-label="Emplacement géographique sélectionné"><strong>{selected.name}</strong><span>{selected.formattedAddress}</span><small>{formatCoordinates(selected.latitude, selected.longitude)}</small><div>{tripAddTargetLabel && onAddToTrip && <button type="button" className="primary-button" onClick={() => { onAddToTrip(selected); onClear() }}>{tripAddTargetLabel}</button>}{canCreate && <button type="button" onClick={() => onCreate(selected)}>Créer un POI</button>}<button type="button" onClick={onClear}>Effacer</button></div></aside>}
    </div>}
    {legacyMode && !expanded && selected && <aside className="geocoding-selection" aria-label="Emplacement géographique sélectionné"><strong>{selected.name}</strong><span>{selected.formattedAddress}</span><small>{formatCoordinates(selected.latitude, selected.longitude)}</small><div>{tripAddTargetLabel && onAddToTrip && <button type="button" className="primary-button" onClick={() => { onAddToTrip(selected); onClear() }}>{tripAddTargetLabel}</button>}{canCreate && <button type="button" onClick={() => onCreate(selected)}>Créer un POI</button>}<button type="button" onClick={onClear}>Effacer</button></div></aside>}
  </section>
}
