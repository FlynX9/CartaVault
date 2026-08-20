import { useEffect, useRef, useState, type FocusEvent, type FormEvent, type KeyboardEvent } from 'react'
import { Search, X } from 'lucide-react'

import { formatCoordinates } from '../../geocoding/coordinates'
import { placeSearchService } from '../../geocoding/placeSearchService'
import type { GeocodingResult } from '../../geocoding/types'

interface Props {
  focus: [number, number]
  expanded?: boolean
  onExpandedChange?: (expanded: boolean) => void
  persistent?: boolean
  countryCode?: string
  selected: GeocodingResult | null
  canCreate?: boolean
  tripAddTargetLabel?: string | null
  onSelect: (result: GeocodingResult) => void
  onClear: () => void
  onCreate: (result: GeocodingResult) => void
  onAddToTrip?: (result: GeocodingResult) => void
}

const SEARCH_EXAMPLES = [
  '123 rue de la Paix, Paris',
  'Place de la Concorde, Paris',
  '48.8566, 2.3522',
]

export function GeographicSearch({ focus, expanded: controlledExpanded, onExpandedChange, persistent = false, countryCode, selected, canCreate = true, tripAddTargetLabel = null, onSelect, onClear, onCreate, onAddToTrip }: Props) {
  const [uncontrolledExpanded, setUncontrolledExpanded] = useState(false)
  const expanded = persistent || (controlledExpanded ?? uncontrolledExpanded)
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
  const legacyMode = controlledExpanded === undefined && !persistent

  const resetSearch = () => {
    controller.current?.abort()
    controller.current = null
    setQuery('')
    setResults([])
    setMessage(null)
    setLoading(false)
    setOpen(false)
    setActiveIndex(0)
  }

  const closeSearch = () => {
    if (!legacyMode || persistent) {
      resetSearch()
      if (selected) onClear()
    } else setOpen(false)
    if (!persistent) setExpanded(false)
  }

  useEffect(() => () => controller.current?.abort(), [])

  useEffect(() => {
    if (!expanded || legacyMode || persistent) return
    setOpen(true)
    const frame = requestAnimationFrame(() => input.current?.focus())
    return () => cancelAnimationFrame(frame)
  }, [expanded, legacyMode, persistent])

  useEffect(() => {
    const closeFromOutside = (event: PointerEvent) => {
      if (section.current?.contains(event.target as Node)) return
      if (persistent) { setOpen(false); return }
      closeSearch()
    }
    document.addEventListener('pointerdown', closeFromOutside)
    return () => document.removeEventListener('pointerdown', closeFromOutside)
  })

  const search = async (searchQuery = query) => {
    const normalized = searchQuery.trim()
    if (!normalized) { setMessage('Saisissez une adresse ou des coordonnées.'); setResults([]); setOpen(true); return }
    controller.current?.abort()
    const next = new AbortController()
    controller.current = next
    setLoading(true)
    setMessage(null)
    setResults([])
    setOpen(true)
    try {
      const found = await placeSearchService.search(normalized, { signal: next.signal, focus, countryCode, limit: 8 })
      if (!next.signal.aborted) {
        setResults(found)
        setActiveIndex(0)
        if (!found.length) setMessage('Aucune adresse trouvée.')
      }
    } catch (error) {
      if (!next.signal.aborted) setMessage(error instanceof Error ? error.message : 'Le service de recherche géographique est indisponible.')
    } finally {
      if (!next.signal.aborted) setLoading(false)
    }
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!expanded) {
      setExpanded(true)
      return
    }
    void search()
  }

  const select = (result: GeocodingResult) => {
    onSelect(result)
    setOpen(false)
    setResults([])
    if (legacyMode) input.current?.focus()
  }

  const handleBlur = (event: FocusEvent<HTMLElement>) => {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return
    setOpen(false)
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      closeSearch()
      return
    }
    if (event.key === 'ArrowDown' && results.length) {
      event.preventDefault()
      setActiveIndex((value) => Math.min(value + 1, results.length - 1))
    }
    if (event.key === 'ArrowUp' && results.length) {
      event.preventDefault()
      setActiveIndex((value) => Math.max(value - 1, 0))
    }
  }

  const selection = selected && <aside className="geocoding-selection" aria-label="Emplacement géographique sélectionné">
    <strong>{selected.name}</strong>
    <span>{selected.formattedAddress}</span>
    <small>{formatCoordinates(selected.latitude, selected.longitude)}</small>
    <div>
      {tripAddTargetLabel && onAddToTrip && <button type="button" className="primary-button" onClick={() => { onAddToTrip(selected); onClear() }}>{tripAddTargetLabel}</button>}
      {canCreate && <button type="button" onClick={() => onCreate(selected)}>Créer un POI</button>}
      <button type="button" onClick={onClear}>Effacer</button>
    </div>
  </aside>

  const resultList = open && !loading && <div className="geocoding-results" id="geocoding-results" role="listbox" aria-label="Résultats géographiques">
    {message && <p role="status">{message}</p>}
    {results.map((result, index) => <button key={result.id} type="button" role="option" aria-selected={index === activeIndex} className={index === activeIndex ? 'active' : undefined} onMouseEnter={() => setActiveIndex(index)} onClick={() => select(result)}>
      <strong>{result.name}</strong>
      <span>{result.formattedAddress}</span>
      <small>{result.layer ?? 'lieu'} · {result.countryName ?? result.countryCode ?? 'Monde'} · {formatCoordinates(result.latitude, result.longitude)}</small>
    </button>)}
  </div>

  if (legacyMode) return <section ref={section} className={`geographic-search${expanded ? ' is-pinned-open' : ''}`} aria-label="Recherche géographique" onBlur={handleBlur}>
    <form className="geographic-search__legacy-form" onSubmit={(event) => { event.preventDefault(); setExpanded(true); void search() }}>
      <label><span className="visually-hidden">Rechercher une adresse ou des coordonnées</span><input ref={input} type="search" value={query} onFocus={() => setExpanded(true)} onChange={(event) => setQuery(event.target.value)} /></label>
      <button type="submit" aria-label="Lancer la recherche géographique"><Search size={18} aria-hidden="true" /><span className="geographic-search__trigger-label">Rechercher</span></button>
    </form>
    {loading && <p className="geocoding-status" role="status">Recherche géographique…</p>}
    {resultList}
    {selection}
  </section>

  return <section ref={section} className={`geographic-search geographic-search--toolbar${persistent ? ' geographic-search--persistent' : ''}${expanded ? ' is-pinned-open' : ''}`} aria-label="Recherche géographique">
    {!expanded ? <button type="button" className="geographic-search__toggle" aria-expanded="false" aria-label="Recherche cartographique" onClick={() => setExpanded(true)}>
      <Search size={18} aria-hidden="true" />
      <span>Recherche</span>
    </button> : <>
      <form className="geographic-search__inline-form" role="search" onSubmit={submit}>
        <Search className="geographic-search__input-icon" size={18} aria-hidden="true" />
        <label>
          <span className="visually-hidden">Adresse, lieu ou coordonnées</span>
          <input
            ref={input}
            type="search"
            value={query}
            placeholder="Adresse, lieu ou coordonnées…"
            autoComplete="off"
            aria-expanded={open}
            aria-controls="geocoding-results"
            onFocus={() => setOpen(true)}
            onChange={(event) => { setQuery(event.target.value); setResults([]); setMessage(null); setOpen(true) }}
            onKeyDown={handleKeyDown}
          />
        </label>
        <button type="button" className="geographic-search__close" aria-label={persistent ? "Effacer la recherche cartographique" : "Fermer la recherche cartographique"} onClick={closeSearch}><X size={18} aria-hidden="true" /></button>
      </form>
      {open && !query.trim() && !loading && <div className="geographic-search__popover geographic-search__examples" id="geocoding-results">
        <span className="geographic-search__popover-title">Exemples</span>
        {SEARCH_EXAMPLES.map((example) => <button key={example} type="button" onClick={() => { setQuery(example); void search(example) }}><Search size={16} aria-hidden="true" /><span>{example}</span></button>)}
      </div>}
      {loading && <p className="geographic-search__popover geocoding-status" role="status">Recherche géographique…</p>}
      {query.trim() && resultList}
      {selection}
    </>}
  </section>
}
