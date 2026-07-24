import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  Check,
  Download,
  ExternalLink,
  Filter,
  Grid2X2,
  Image as ImageIcon,
  List,
  MapPin,
  Minus,
  MoreHorizontal,
  Plus,
  Search,
  Star,
  Trash2,
  X,
} from 'lucide-react'

import {
  bulkDeleteMedia,
  deleteMedia,
  getMedia,
  getMediaDownloadUrl,
  getMediaThumbnailUrl,
  setMainMedia,
  updateMedia,
} from '../../api/media'
import type { MediaItem, MediaPage, MediaQuery } from '../../types/media'
import { useConfirmDialog } from '../common/useConfirmDialog'
import { mediaMessages } from './mediaI18n'

const DEFAULT_QUERY: MediaQuery = {
  page: 1,
  pageSize: 18,
  query: '',
  mapId: '',
  countryCode: '',
  format: '',
  uploaderId: '',
  primary: '',
  fileState: '',
  createdFrom: '',
  createdTo: '',
  minSize: '',
  maxSize: '',
  minWidth: '',
  minHeight: '',
  sortBy: 'created_at',
  sortDirection: 'desc',
}

function formatBytes(value: number | null): string {
  if (value === null) return '—'
  if (value < 1024) return `${value} o`
  if (value < 1024 ** 2) return `${(value / 1024).toFixed(1)} Kio`
  return `${(value / 1024 ** 2).toFixed(1)} Mio`
}

function formatDate(value: string | null): string {
  if (!value) return '—'
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' }).format(new Date(value))
}

interface DetailsProps {
  media: MediaItem
  onClose: () => void
  onChanged: () => void
  onOpenPlace: (media: MediaItem) => void
}

function MediaDetails({ media, onClose, onChanged, onOpenPlace }: DetailsProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const [caption, setCaption] = useState(media.caption ?? '')
  const [takenAt, setTakenAt] = useState(media.taken_at ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const previouslyFocused = document.activeElement
    closeButtonRef.current?.focus()
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('keydown', closeOnEscape)
      if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus()
    }
  }, [onClose])

  const save = async () => {
    setBusy(true); setError(null)
    try {
      await updateMedia(media.id, { caption: caption.trim() || null, taken_at: takenAt || null })
      onChanged()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Modification impossible.')
    } finally { setBusy(false) }
  }

  return <div className="media-details-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <section className="media-details-dialog" role="dialog" aria-modal="true" aria-labelledby="media-details-title">
      <header>
        <div><p className="cv-workspace-panel__eyebrow">Médiathèque</p><h2 id="media-details-title">{media.original_name || media.place.name}</h2></div>
        <button ref={closeButtonRef} type="button" className="panel-icon-button" aria-label="Fermer" onClick={onClose}><X size={18} /></button>
      </header>
      <div className="media-details-layout">
        <img src={getMediaThumbnailUrl(media.id)} alt={media.caption || media.original_name || media.place.name} />
        <dl>
          <div><dt>Lieu</dt><dd>{media.place.name}</dd></div>
          <div><dt>Carte</dt><dd>{media.map.name} · {media.map.country_name}</dd></div>
          <div><dt>Fichier</dt><dd>{media.format ?? '—'} · {formatBytes(media.file_size_bytes)}</dd></div>
          <div><dt>Dimensions</dt><dd>{media.width && media.height ? `${media.width} × ${media.height} px` : '—'}</dd></div>
          <div><dt>Ajouté le</dt><dd>{formatDate(media.created_at)}</dd></div>
          <div><dt>Ajouté par</dt><dd>{media.uploader?.name ?? 'Inconnu'}</dd></div>
        </dl>
      </div>
      {media.can_edit && <div className="media-details-fields">
        <label>Légende<textarea value={caption} onChange={(event) => setCaption(event.target.value)} /></label>
        <label>Date de prise de vue<input type="date" value={takenAt} onChange={(event) => setTakenAt(event.target.value)} /></label>
      </div>}
      {error && <p className="form-alert" role="alert">{error}</p>}
      <footer>
        <button type="button" className="secondary-button" onClick={() => onOpenPlace(media)}><MapPin size={16} />Ouvrir le lieu</button>
        <a className="secondary-button" href={getMediaDownloadUrl(media.id)}><Download size={16} />Télécharger</a>
        {media.can_edit && <button type="button" className="primary-button" disabled={busy} onClick={() => void save()}>Enregistrer</button>}
      </footer>
    </section>
  </div>
}

interface Props {
  collapsed?: boolean
  onCollapsedChange?: (collapsed: boolean) => void
  onClose?: () => void
  onOpenPlace: (media: MediaItem) => void
}

export function MediaWorkspacePanel({ collapsed = false, onCollapsedChange, onClose, onOpenPlace }: Props) {
  const t = mediaMessages()
  const { confirm, confirmationDialog } = useConfirmDialog()
  const [query, setQuery] = useState<MediaQuery>(DEFAULT_QUERY)
  const [debouncedQuery, setDebouncedQuery] = useState(query)
  const [data, setData] = useState<MediaPage | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(() => new Set())
  const [details, setDetails] = useState<MediaItem | null>(null)
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [refresh, setRefresh] = useState(0)

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query), 300)
    return () => window.clearTimeout(timer)
  }, [query])

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true); setError(null)
    void getMedia(debouncedQuery, controller.signal)
      .then(setData)
      .catch((caught: unknown) => {
        if (caught instanceof Error && caught.name === 'AbortError') return
        setError(caught instanceof Error ? caught.message : 'Médiathèque indisponible.')
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [debouncedQuery, refresh])

  const change = <K extends keyof MediaQuery>(key: K, value: MediaQuery[K]) => {
    setQuery((current) => ({ ...current, page: 1, [key]: value }))
  }
  const reload = useCallback(() => setRefresh((value) => value + 1), [])
  const editableSelection = useMemo(
    () => data?.items.filter((item) => selected.has(item.id) && item.can_edit) ?? [],
    [data, selected],
  )
  const countryOptions = useMemo(
    () => Array.from(
      new Map((data?.filters.maps ?? []).map((item) => [
        item.country_code,
        { code: item.country_code, name: item.country_name },
      ])).values(),
    ).sort((left, right) => left.name.localeCompare(right.name)),
    [data],
  )
  const pageNumbers = useMemo(() => {
    if (!data) return []
    return [...new Set([1, data.pages, query.page - 1, query.page, query.page + 1])]
      .filter((value) => value >= 1 && value <= data.pages)
      .sort((left, right) => left - right)
  }, [data, query.page])

  const removeOne = async (media: MediaItem) => {
    if (!await confirm({ title: 'Supprimer ce média ?', message: `« ${media.original_name || media.place.name} » sera définitivement supprimé.` })) return
    try { await deleteMedia(media.id); setDetails(null); setSelected((current) => { const next = new Set(current); next.delete(media.id); return next }); reload() }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Suppression impossible.') }
  }
  const removeSelected = async () => {
    if (!editableSelection.length) return
    if (!await confirm({ title: 'Supprimer les médias sélectionnés ?', message: `${editableSelection.length} média(s) seront définitivement supprimés.` })) return
    try { await bulkDeleteMedia(editableSelection.map((item) => item.id)); setSelected(new Set()); reload() }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Suppression groupée impossible.') }
  }

  return <aside id="workspace-media-panel" className={`country-place-panel cv-workspace-panel media-workspace-panel${collapsed ? ' is-collapsed' : ''}`} aria-label="Médiathèque" tabIndex={-1}>
    <header className="cv-workspace-panel__header">
      <div className="cv-workspace-panel__heading"><p className="cv-workspace-panel__eyebrow">Bibliothèque</p><h1 className="cv-workspace-panel__title">{t.title}</h1></div>
      <div className="cv-workspace-panel__header-actions"><span className="cv-workspace-panel__count">{data?.total ?? 0} médias</span><button type="button" className="panel-icon-button workspace-panel-collapse-toggle" aria-label={collapsed ? 'Agrandir le panneau' : 'Réduire le panneau'} title={collapsed ? 'Agrandir' : 'Réduire'} aria-expanded={!collapsed} onClick={() => (onCollapsedChange ?? (() => onClose?.()))(!collapsed)}>{collapsed ? <Plus size={18} /> : <Minus size={18} />}</button></div>
    </header>
    <div className="media-toolbar">
      <label className="media-search"><Search size={17} /><input value={query.query} onChange={(event) => change('query', event.target.value)} placeholder={t.search} /></label>
      <div className="media-toolbar__actions">
      <details className="media-filters">
        <summary><Filter size={16} />{t.filters}</summary>
        <div>
          <label>Carte<select value={query.mapId} onChange={(event) => change('mapId', event.target.value)}><option value="">Toutes</option>{data?.filters.maps.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <label>Pays<select value={query.countryCode} onChange={(event) => change('countryCode', event.target.value)}><option value="">Tous</option>{countryOptions.map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}</select></label>
          <label>Format<select value={query.format} onChange={(event) => change('format', event.target.value)}><option value="">Tous</option>{data?.filters.formats.map((item) => <option key={item}>{item}</option>)}</select></label>
          <label>Ajouté par<select value={query.uploaderId} onChange={(event) => change('uploaderId', event.target.value)}><option value="">Tous</option>{data?.filters.uploaders.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <label>Type<select value={query.primary} onChange={(event) => change('primary', event.target.value as MediaQuery['primary'])}><option value="">Tous</option><option value="true">Photos principales</option><option value="false">Photos secondaires</option></select></label>
          <label>Diagnostic<select value={query.fileState} onChange={(event) => change('fileState', event.target.value as MediaQuery['fileState'])}><option value="">Tous</option><option value="healthy">Sains</option><option value="missing">Fichiers manquants</option><option value="error">En erreur</option></select></label>
          <label>Ajouté depuis<input type="date" value={query.createdFrom} max={query.createdTo || undefined} onChange={(event) => change('createdFrom', event.target.value)} /></label>
          <label>Ajouté jusqu’au<input type="date" value={query.createdTo} min={query.createdFrom || undefined} onChange={(event) => change('createdTo', event.target.value)} /></label>
          <label>Taille min. (octets)<input type="number" min="0" value={query.minSize} onChange={(event) => change('minSize', event.target.value)} /></label>
          <label>Taille max. (octets)<input type="number" min={query.minSize || '0'} value={query.maxSize} onChange={(event) => change('maxSize', event.target.value)} /></label>
          <label>Largeur min. (px)<input type="number" min="1" value={query.minWidth} onChange={(event) => change('minWidth', event.target.value)} /></label>
          <label>Hauteur min. (px)<input type="number" min="1" value={query.minHeight} onChange={(event) => change('minHeight', event.target.value)} /></label>
        </div>
      </details>
      <label className="media-sort">Trier<select value={query.sortBy} onChange={(event) => change('sortBy', event.target.value as MediaQuery['sortBy'])}><option value="created_at">Ajout récent</option><option value="name">Nom</option><option value="place">Lieu</option><option value="map">Carte</option><option value="size">Taille</option></select></label>
      <div className="media-view-switch" role="group" aria-label="Mode d’affichage">
        <button type="button" className={viewMode === 'grid' ? 'active' : ''} aria-label="Affichage en grille" aria-pressed={viewMode === 'grid'} onClick={() => setViewMode('grid')}><Grid2X2 size={17} /></button>
        <button type="button" className={viewMode === 'list' ? 'active' : ''} aria-label="Affichage en liste" aria-pressed={viewMode === 'list'} onClick={() => setViewMode('list')}><List size={18} /></button>
      </div>
      </div>
    </div>
    {data && <div className="media-aggregates" aria-label="Résumé du stockage">
      <span><i><ImageIcon size={19} /></i><b>{data.aggregates.total_count}<small>fichiers</small></b></span>
      <span><i className="primary"><Star size={19} fill="currentColor" /></i><b>{data.aggregates.primary_count}<small>principales</small></b></span>
      <span><i className="warning"><AlertTriangle size={19} /></i><b>{data.aggregates.missing_count + data.aggregates.error_count}<small>à vérifier</small></b></span>
    </div>}
    {error && <div className="form-alert" role="alert">{error}<button type="button" onClick={reload}>Réessayer</button></div>}
    {loading && <p className="media-state" role="status">{t.loading}</p>}
    {!loading && data?.items.length === 0 && <p className="media-state">{t.empty}</p>}
    <div className={`media-grid ${viewMode}`}>
      {data?.items.map((media) => {
        const checked = selected.has(media.id)
        return <article className={`media-card${checked ? ' selected' : ''}`} key={media.id}>
          <button type="button" className="media-card__preview" onClick={() => setDetails(media)} aria-label={`Ouvrir ${media.original_name || media.place.name}`}>
            {media.file_state === 'healthy' ? <img loading="lazy" src={getMediaThumbnailUrl(media.id)} alt="" /> : <span><AlertTriangle size={25} />Fichier indisponible</span>}
          </button>
          <label className="media-card__select"><input type="checkbox" checked={checked} onChange={() => setSelected((current) => { const next = new Set(current); if (next.has(media.id)) next.delete(media.id); else next.add(media.id); return next })} /><span className="sr-only">Sélectionner</span></label>
          {media.is_primary && <span className="media-primary" title="Photo principale"><Star size={14} fill="currentColor" />Principale</span>}
          <div className="media-card__body">
            <strong title={media.original_name ?? media.place.name}>{media.original_name || media.place.name}</strong>
            <button type="button" onClick={() => onOpenPlace(media)}><MapPin size={14} />{media.place.name}</button>
            <span>{media.map.name} · {media.map.country_code}</span>
            <small>{media.format ?? '—'} · {formatBytes(media.file_size_bytes)} · {media.width && media.height ? `${media.width}×${media.height}` : 'dimensions inconnues'}</small>
          </div>
          <details className="media-card__menu">
            <summary aria-label={`Actions pour ${media.original_name || media.place.name}`}><MoreHorizontal size={17} /></summary>
            <div className="media-card__actions">
              <a href={getMediaDownloadUrl(media.id)} aria-label="Télécharger"><Download size={15} />Télécharger</a>
              <button type="button" onClick={() => onOpenPlace(media)}><ExternalLink size={15} />Ouvrir le lieu</button>
              {media.can_edit && !media.is_primary && <button type="button" onClick={() => void setMainMedia(media.id).then(reload)}><Star size={15} />Définir comme principale</button>}
              {media.can_edit && <button type="button" className="danger" onClick={() => void removeOne(media)}><Trash2 size={15} />Supprimer</button>}
            </div>
          </details>
        </article>
      })}
    </div>
    {data && <footer className="media-pagination">
      <label>Résultats par page<select value={query.pageSize} onChange={(event) => setQuery((current) => ({ ...current, page: 1, pageSize: Number(event.target.value) }))}><option value="18">18</option><option value="30">30</option><option value="60">60</option></select></label>
      <nav aria-label="Pagination des médias">
        <button type="button" aria-label="Page précédente" disabled={query.page === 1} onClick={() => setQuery((current) => ({ ...current, page: current.page - 1 }))}>‹</button>
        {pageNumbers.map((page, index) => <span key={page}>{index > 0 && page - pageNumbers[index - 1] > 1 && <i>…</i>}<button type="button" className={page === query.page ? 'active' : ''} aria-current={page === query.page ? 'page' : undefined} onClick={() => setQuery((current) => ({ ...current, page }))}>{page}</button></span>)}
        <button type="button" aria-label="Page suivante" disabled={query.page >= data.pages} onClick={() => setQuery((current) => ({ ...current, page: current.page + 1 }))}>›</button>
      </nav>
      <span>Page {query.page} sur {data.pages}</span>
    </footer>}
    {selected.size > 0 && <div className="media-bulk-bar"><span><Check size={16} />{selected.size} sélectionné(s)</span><button type="button" onClick={() => setSelected(new Set())}>Tout désélectionner</button>{editableSelection.length > 0 && <button type="button" className="danger" onClick={() => void removeSelected()}><Trash2 size={15} />Supprimer</button>}</div>}
    {details && <MediaDetails media={details} onClose={() => setDetails(null)} onChanged={() => { setDetails(null); reload() }} onOpenPlace={onOpenPlace} />}
    {confirmationDialog}
  </aside>
}
