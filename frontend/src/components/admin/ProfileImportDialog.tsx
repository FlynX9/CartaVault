import { IconPackageImport } from '@tabler/icons-react'
import { Check, Map as MapIcon, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import { getMapProfiles, importMapProfileResources } from '../../api/maps'
import { getCategories } from '../../api/categories'
import { getStatuses } from '../../api/statuses'
import { getTags } from '../../api/tags'
import { useModalFocus } from '../../hooks/useModalFocus'
import type { StarterProfile, StarterProfileId, StarterProfileResourceType } from '../../types/map'
import { CategoryIconPreview } from '../icons/CategoryIconPreview'

const LABELS = {
  categories: { singular: 'catégorie', plural: 'catégories', feminine: true },
  tags: { singular: 'tag', plural: 'tags', feminine: false },
  statuses: { singular: 'statut', plural: 'statuts', feminine: false },
} satisfies Record<StarterProfileResourceType, { singular: string; plural: string; feminine: boolean }>

interface ProfileImportDialogProps {
  mapId: string
  resourceType: StarterProfileResourceType
  onClose: () => void
  onImported: (message: string) => void
}

export function ProfileImportDialog({ mapId, resourceType, onClose, onImported }: ProfileImportDialogProps) {
  const dialog = useRef<HTMLDivElement>(null)
  const [profiles, setProfiles] = useState<StarterProfile[]>([])
  const [existingNames, setExistingNames] = useState<Set<string>>(new Set())
  const [selectedId, setSelectedId] = useState<StarterProfileId | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const labels = LABELS[resourceType]
  useModalFocus({ dialogRef: dialog, onEscape: onClose })

  useEffect(() => {
    const controller = new AbortController()
    void Promise.all([
      getMapProfiles(controller.signal),
      getExistingNames(mapId, resourceType, controller.signal),
    ])
      .then(([items, names]) => {
        setProfiles(items.filter((profile) => profile[resourceType].length > 0))
        setExistingNames(new Set(names.map(normalizeName)))
      })
      .catch((caught: unknown) => { if (!(caught instanceof Error && caught.name === 'AbortError')) setError('Impossible de charger les profils.') })
      .finally(() => { if (!controller.signal.aborted) setIsLoading(false) })
    return () => controller.abort()
  }, [mapId, resourceType])

  const selectedProfile = profiles.find((profile) => profile.id === selectedId)
  const itemsToCreate = selectedProfile?.[resourceType].filter((item) => !existingNames.has(normalizeName(item.name))) ?? []
  const skippedCount = (selectedProfile?.[resourceType].length ?? 0) - itemsToCreate.length

  const submit = async () => {
    if (!selectedId || isSubmitting) return
    setIsSubmitting(true); setError(null)
    try {
      const result = await importMapProfileResources(mapId, selectedId, resourceType)
      const agreement = labels.feminine ? (result.created > 1 ? 'ées' : 'ée') : (result.created > 1 ? 'és' : 'é')
      const skipped = result.skipped > 0 ? `, ${result.skipped} déjà présent${result.skipped > 1 ? 's' : ''}` : ''
      onImported(`${result.created} ${result.created === 1 ? labels.singular : labels.plural} import${agreement}${skipped}.`)
      onClose()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "L'import a échoué.")
    } finally { setIsSubmitting(false) }
  }

  return createPortal(
    <div className="cv-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <div ref={dialog} className="cv-modal profile-import-dialog" role="dialog" aria-modal="true" aria-labelledby="profile-import-title">
        <header><span className="profile-import-dialog__header-icon"><IconPackageImport stroke={1.8} aria-hidden="true" /></span><div><span className="profile-import-dialog__eyebrow">ORGANISATION</span><h2 id="profile-import-title">Importer des {labels.plural}</h2><p>Choisissez un profil. Les noms déjà présents seront ignorés.</p></div><button type="button" onClick={onClose} aria-label="Fermer"><X /></button></header>
        <div className="profile-import-dialog__body">
          {error && <p className="form-alert" role="alert">{error}</p>}
          {isLoading ? <p role="status">Chargement des profils…</p> : <div className="profile-import-grid" role="radiogroup" aria-label="Profil à importer">
            {profiles.map((profile) => { const selected = selectedId === profile.id; const importableCount = profile[resourceType].filter((item) => !existingNames.has(normalizeName(item.name))).length; return <button key={profile.id} type="button" role="radio" aria-checked={selected} className={selected ? 'selected' : ''} onClick={() => setSelectedId(profile.id)}><span className="profile-import-card__icon"><MapIcon /></span><span><strong>{profile.name}</strong><small>{profile.description}</small></span><b title={`${importableCount} élément${importableCount > 1 ? 's' : ''} à créer`}>{importableCount}</b>{selected && <Check className="profile-import-card__check" />}</button> })}
          </div>}
          {selectedProfile && <ProfileImportPreview resourceType={resourceType} items={itemsToCreate} skippedCount={skippedCount} />}
        </div>
        <footer><button className="cv-home-action-button" type="button" onClick={onClose}>Annuler</button><button className="cv-home-action-button primary" type="button" disabled={!selectedId || itemsToCreate.length === 0 || isSubmitting} onClick={() => void submit()}><IconPackageImport stroke={1.8} aria-hidden="true" />{isSubmitting ? 'Import en cours…' : 'Importer'}</button></footer>
      </div>
    </div>, document.body,
  )
}

type ProfileResourceItem = StarterProfile['categories'][number] | StarterProfile['tags'][number] | StarterProfile['statuses'][number]

function ProfileImportPreview({ resourceType, items, skippedCount }: { resourceType: StarterProfileResourceType; items: ProfileResourceItem[]; skippedCount: number }) {
  const labels = LABELS[resourceType]
  return <section className="profile-import-preview" aria-live="polite">
    <header><div><h3>Éléments à créer</h3><p>{items.length} {items.length === 1 ? labels.singular : labels.plural}{skippedCount > 0 ? ` · ${skippedCount} déjà présent${skippedCount > 1 ? 's' : ''} ignoré${skippedCount > 1 ? 's' : ''}` : ''}</p></div><span>{items.length}</span></header>
    {items.length === 0 ? <p className="profile-import-preview__empty">Tous les éléments de ce profil existent déjà sur la carte.</p> : <ul>{items.map((item) => <li key={item.key}>
      {resourceType === 'categories' && 'icon_id' in item && <CategoryIconPreview iconId={item.icon_id} size={18} showLabel={false} />}
      {resourceType !== 'categories' && 'color' in item && <span className="profile-import-preview__color" style={{ backgroundColor: item.color }} />}
      <span>{item.name}</span>
      {resourceType === 'statuses' && 'functional_state' in item && <small>{item.functional_state === 'visited' ? 'Visité' : 'Non visité'}</small>}
    </li>)}</ul>}
  </section>
}

function normalizeName(value: string): string {
  return value.normalize('NFKC').trim().toLocaleLowerCase()
}

async function getExistingNames(mapId: string, resourceType: StarterProfileResourceType, signal: AbortSignal): Promise<string[]> {
  if (resourceType === 'categories') return (await getCategories(signal, undefined, mapId)).map((item) => item.name)
  if (resourceType === 'tags') return (await getTags(signal, undefined, mapId)).map((item) => item.name)
  return (await getStatuses(mapId, signal)).map((item) => item.name)
}
