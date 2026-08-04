import { ArrowDown, ArrowUp, ExternalLink, Link2, Plus, Trash2 } from 'lucide-react'

import type { PlaceLinkFormValue } from '../../types/place'

const LINK_LABEL_SUGGESTIONS = [
  'Site officiel',
  'Article',
  'Fiche patrimoine',
  'Google Maps',
  'OpenStreetMap',
  'Galerie ou archive',
  'Vidéo',
  'Autre référence',
]

function newClientId(): string {
  return `link-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function linkError(link: PlaceLinkFormValue, links: PlaceLinkFormValue[]): string | null {
  const label = link.label.trim()
  const url = link.url.trim()
  if (!label) return 'Donnez un nom à ce lien.'
  if (label.length > 120) return 'Maximum 120 caractères.'
  if (!url) return 'Saisissez une URL.'
  if (url.length > 2048) return 'Maximum 2 048 caractères.'
  try {
    const parsed = new URL(url)
    if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.host || /\s/.test(url)) return 'Utilisez une adresse HTTP ou HTTPS valide.'
  } catch {
    return 'Utilisez une adresse HTTP ou HTTPS valide.'
  }
  if (links.some((candidate) => candidate.clientId !== link.clientId && candidate.url.trim() === url)) return 'Cette URL est déjà présente.'
  return null
}

export function PlaceLinksEditor({ links, onChange, error }: { links: PlaceLinkFormValue[]; onChange: (links: PlaceLinkFormValue[]) => void; error?: string }) {
  const update = (clientId: string, field: 'label' | 'url', value: string) => onChange(links.map((link) => link.clientId === clientId ? { ...link, [field]: value } : link))
  const move = (index: number, offset: -1 | 1) => {
    const target = index + offset
    if (target < 0 || target >= links.length) return
    const reordered = [...links]
    ;[reordered[index], reordered[target]] = [reordered[target], reordered[index]]
    onChange(reordered)
  }

  return <section className="place-links-editor" aria-labelledby="place-links-title">
    <header>
      <span className="place-links-editor__icon"><Link2 size={18} aria-hidden="true" /></span>
      <div><h3 id="place-links-title">Liens externes</h3><p>Ajoutez les sources et pages utiles associées à ce lieu.</p></div>
      <button type="button" className="secondary-button place-links-editor__add" disabled={links.length >= 20} onClick={() => onChange([...links, { clientId: newClientId(), label: '', url: '' }])}><Plus size={15} aria-hidden="true" />Ajouter un lien</button>
    </header>
    {links.length === 0
      ? <p className="place-links-editor__empty">Aucun lien ajouté.</p>
      : <div className="place-links-editor__table" role="table" aria-label="Liens du POI">
        <div className="place-links-editor__table-head" role="row"><span role="columnheader">Nom</span><span role="columnheader">Adresse</span><span role="columnheader">Ordre</span></div>
        {links.map((link, index) => {
          const validationMessage = link.label || link.url ? linkError(link, links) : null
          return <div className="place-links-editor__row" role="row" key={link.clientId}>
            <label role="cell"><span className="sr-only">Nom du lien {index + 1}</span><input list="place-link-label-suggestions" maxLength={120} value={link.label} placeholder="Site officiel" aria-invalid={Boolean(validationMessage)} onChange={(event) => update(link.clientId, 'label', event.target.value)} /></label>
            <label role="cell"><span className="sr-only">URL du lien {index + 1}</span><span className="place-links-editor__url"><input type="url" maxLength={2048} value={link.url} placeholder="https://…" aria-invalid={Boolean(validationMessage)} onChange={(event) => update(link.clientId, 'url', event.target.value)} />{!validationMessage && link.url && <a href={link.url.trim()} target="_blank" rel="noopener noreferrer" aria-label={`Ouvrir ${link.label || `le lien ${index + 1}`} dans un nouvel onglet`} title="Ouvrir le lien"><ExternalLink size={15} /></a>}</span>{validationMessage && <small className="field-error">{validationMessage}</small>}</label>
            <div className="place-links-editor__actions" role="cell">
              <button type="button" disabled={index === 0} aria-label={`Monter ${link.label || `le lien ${index + 1}`}`} title="Monter" onClick={() => move(index, -1)}><ArrowUp size={15} /></button>
              <button type="button" disabled={index === links.length - 1} aria-label={`Descendre ${link.label || `le lien ${index + 1}`}`} title="Descendre" onClick={() => move(index, 1)}><ArrowDown size={15} /></button>
              <button type="button" className="danger" aria-label={`Supprimer ${link.label || `le lien ${index + 1}`}`} title="Supprimer" onClick={() => onChange(links.filter((candidate) => candidate.clientId !== link.clientId))}><Trash2 size={15} /></button>
            </div>
          </div>
        })}
      </div>}
    <datalist id="place-link-label-suggestions">{LINK_LABEL_SUGGESTIONS.map((suggestion) => <option key={suggestion} value={suggestion} />)}</datalist>
    {error && <small className="field-error place-links-editor__error" role="alert">{error}</small>}
    <small className="form-hint">20 liens maximum. Seules les adresses HTTP et HTTPS sont acceptées.</small>
  </section>
}
