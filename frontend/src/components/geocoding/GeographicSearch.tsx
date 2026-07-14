import { useEffect, useRef, useState, type FormEvent } from 'react'

import { formatCoordinates } from '../../geocoding/coordinates'
import { geocodingService } from '../../geocoding/geocodingService'
import type { GeocodingResult } from '../../geocoding/types'

interface Props { focus: [number, number]; countryCode?: string; selected: GeocodingResult | null; onSelect: (result: GeocodingResult) => void; onClear: () => void; onCreate: (result: GeocodingResult) => void }

export function GeographicSearch({ focus, countryCode, selected, onSelect, onClear, onCreate }: Props) {
  const [query, setQuery] = useState(''); const [results, setResults] = useState<GeocodingResult[]>([]); const [loading, setLoading] = useState(false); const [message, setMessage] = useState<string | null>(null); const [open, setOpen] = useState(false); const [activeIndex, setActiveIndex] = useState(0); const controller = useRef<AbortController | null>(null); const input = useRef<HTMLInputElement>(null)
  useEffect(() => () => controller.current?.abort(), [])
  const search = async () => {
    const normalized = query.trim(); if (!normalized) { setMessage('Saisissez une adresse ou des coordonnées.'); setResults([]); setOpen(true); return }
    controller.current?.abort(); const next = new AbortController(); controller.current = next; setLoading(true); setMessage(null); setOpen(true)
    try { const found = await geocodingService.search(normalized, { signal: next.signal, focus, countryCode, limit: 6 }); if (!next.signal.aborted) { setResults(found); setActiveIndex(0); if (!found.length) setMessage('Aucune adresse trouvée.') } }
    catch (error) { if (!next.signal.aborted) setMessage(error instanceof Error ? error.message : 'Le service de recherche géographique est indisponible.') }
    finally { if (!next.signal.aborted) setLoading(false) }
  }
  const submit = (event: FormEvent) => { event.preventDefault(); void search() }
  const select = (result: GeocodingResult) => { onSelect(result); setOpen(false); setResults([]); input.current?.focus() }
  return <section className="geographic-search" aria-label="Recherche géographique"><form onSubmit={submit}><label><span className="visually-hidden">Rechercher une adresse ou des coordonnées</span><input ref={input} type="search" value={query} placeholder="Rechercher une adresse ou des coordonnées…" onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === 'Escape') { setOpen(false); setResults([]); input.current?.focus() } if (event.key === 'ArrowDown' && results.length) { event.preventDefault(); setActiveIndex((value) => Math.min(value + 1, results.length - 1)) } if (event.key === 'ArrowUp' && results.length) { event.preventDefault(); setActiveIndex((value) => Math.max(value - 1, 0)) } }} aria-expanded={open} aria-controls="geocoding-results" /></label><button type="submit" aria-label="Lancer la recherche géographique" disabled={loading}>{loading ? '…' : '⌕'}</button></form>
    {loading && <p className="geocoding-status" role="status">Recherche géographique…</p>}
    {open && !loading && <div className="geocoding-results" id="geocoding-results" role="listbox" aria-label="Résultats géographiques">{message && <p role="status">{message}</p>}{results.map((result, index) => <button key={result.id} type="button" role="option" aria-selected={index === activeIndex} className={index === activeIndex ? 'active' : undefined} onMouseEnter={() => setActiveIndex(index)} onClick={() => select(result)}><strong>{result.name}</strong><span>{result.formattedAddress}</span><small>{result.layer ?? 'lieu'} · {result.countryName ?? result.countryCode ?? 'Monde'} · {formatCoordinates(result.latitude, result.longitude)}</small></button>)}</div>}
    {selected && <aside className="geocoding-selection" aria-label="Emplacement géographique sélectionné"><strong>{selected.name}</strong><span>{selected.formattedAddress}</span><small>{formatCoordinates(selected.latitude, selected.longitude)}</small><div><button type="button" className="primary-button" onClick={() => onCreate(selected)}>Créer un POI ici</button><button type="button" onClick={onClear}>Effacer</button></div></aside>}
  </section>
}
