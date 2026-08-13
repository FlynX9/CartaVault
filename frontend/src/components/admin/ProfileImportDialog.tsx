import { IconPackageImport } from '@tabler/icons-react'
import { Camera, ChevronLeft, ChevronRight, Factory, Landmark, LayoutGrid, MapPinned, Route, Trees, UtensilsCrossed, X } from 'lucide-react'
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

const PROFILE_ICONS = {
  general: LayoutGrid,
  urbex: Factory,
  photography: Camera,
  tourism: MapPinned,
  hiking: Trees,
  heritage: Landmark,
  road_trip: Route,
  gastronomy: UtensilsCrossed,
} satisfies Partial<Record<StarterProfileId, typeof LayoutGrid>>

interface ProfileImportDialogProps {
  mapId: string
  resourceType: StarterProfileResourceType
  onClose: () => void
  onImported: (message: string) => void
}

export function ProfileImportDialog({ mapId, resourceType, onClose, onImported }: ProfileImportDialogProps) {
  const dialog = useRef<HTMLDivElement>(null)
  const profileTrack = useRef<HTMLDivElement>(null)
  const [profiles, setProfiles] = useState<StarterProfile[]>([])
  const [existingItems, setExistingItems] = useState<ExistingResource[]>([])
  const [selectedId, setSelectedId] = useState<StarterProfileId | null>(null)
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set())
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const labels = LABELS[resourceType]
  useModalFocus({ dialogRef: dialog, onEscape: onClose })

  useEffect(() => {
    const controller = new AbortController()
    void Promise.all([
      getMapProfiles(controller.signal),
      getExistingItems(mapId, resourceType, controller.signal),
    ])
      .then(([items, existing]) => {
        const availableProfiles = items.filter((profile) => profile[resourceType].length > 0)
        setProfiles(availableProfiles)
        setSelectedId(availableProfiles[0]?.id ?? null)
        setExistingItems(existing)
      })
      .catch((caught: unknown) => { if (!(caught instanceof Error && caught.name === 'AbortError')) setError('Impossible de charger les profils.') })
      .finally(() => { if (!controller.signal.aborted) setIsLoading(false) })
    return () => controller.abort()
  }, [mapId, resourceType])

  const selectedProfile = profiles.find((profile) => profile.id === selectedId)
  const profileItems = selectedProfile?.[resourceType] ?? []
  const duplicateKeys = new Set(profileItems.filter((item) => isDuplicate(item, resourceType, existingItems)).map((item) => item.key))
  const selectedItems = profileItems.filter((item) => !duplicateKeys.has(item.key) && selectedKeys.has(item.key))

  useEffect(() => {
    if (!selectedProfile) { setSelectedKeys(new Set()); return }
    setSelectedKeys(new Set(selectedProfile[resourceType]
      .filter((item) => !isDuplicate(item, resourceType, existingItems))
      .map((item) => item.key)))
  }, [selectedId, selectedProfile, resourceType, existingItems])

  const selectedIndex = Math.max(0, profiles.findIndex((profile) => profile.id === selectedId))
  const selectProfileAt = (index: number) => {
    const profile = profiles[index]
    if (!profile) return
    setSelectedId(profile.id)
    ;(profileTrack.current?.children[index] as HTMLElement | undefined)?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest', inline: 'center' })
  }
  const synchronizeScrolledProfile = () => {
    const track = profileTrack.current
    if (!track || track.children.length === 0) return
    const trackCenter = track.scrollLeft + track.clientWidth / 2
    let closestIndex = 0
    let closestDistance = Number.POSITIVE_INFINITY
    Array.from(track.children).forEach((child, index) => {
      const card = child as HTMLElement
      const distance = Math.abs(card.offsetLeft + card.offsetWidth / 2 - trackCenter)
      if (distance < closestDistance) { closestDistance = distance; closestIndex = index }
    })
    const profile = profiles[closestIndex]
    if (profile && profile.id !== selectedId) setSelectedId(profile.id)
  }

  const submit = async () => {
    if (!selectedId || isSubmitting) return
    setIsSubmitting(true); setError(null)
    try {
      const result = await importMapProfileResources(mapId, selectedId, resourceType, selectedItems.map((item) => item.key))
      const agreement = labels.feminine ? (result.created > 1 ? 'ées' : 'ée') : (result.created > 1 ? 'és' : 'é')
      const skipped = result.skipped > 0 ? `, ${result.skipped} déjà présent${result.skipped > 1 ? 's' : ''}` : ''
      onImported(`${result.created} ${result.created === 1 ? labels.singular : labels.plural} import${agreement}${skipped}.`)
      onClose()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "L'import a échoué.")
    } finally { setIsSubmitting(false) }
  }

  return createPortal(
    <div className="cv-overlay profile-import-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <div ref={dialog} className="cv-modal profile-import-dialog" role="dialog" aria-modal="true" aria-labelledby="profile-import-title">
        <header><span className="profile-import-dialog__header-icon"><IconPackageImport stroke={1.8} aria-hidden="true" /></span><div><span className="profile-import-dialog__eyebrow">ORGANISATION</span><h2 id="profile-import-title">Importer des {labels.plural}</h2><p>Choisissez un profil. Les noms déjà présents seront ignorés.</p></div><button type="button" onClick={onClose} aria-label="Fermer"><X /></button></header>
        <div className="profile-import-dialog__body">
          {error && <p className="form-alert" role="alert">{error}</p>}
          {isLoading ? <p role="status">Chargement des profils…</p> : <div className="profile-import-carousel">
            <button className="profile-import-carousel__arrow profile-import-carousel__arrow--previous" type="button" aria-label="Profil précédent" disabled={profiles.length < 2} onClick={() => selectProfileAt((selectedIndex - 1 + profiles.length) % profiles.length)}><ChevronLeft /></button>
            <div ref={profileTrack} className="profile-import-grid" role="radiogroup" aria-label="Profil à importer" onScroll={synchronizeScrolledProfile}>
              {profiles.map((profile) => { const selected = selectedId === profile.id; const importableCount = profile[resourceType].filter((item) => !isDuplicate(item, resourceType, existingItems)).length; const ProfileIcon = PROFILE_ICONS[profile.id as keyof typeof PROFILE_ICONS] ?? LayoutGrid; return <button key={profile.id} type="button" role="radio" aria-checked={selected} className={selected ? 'selected' : ''} onClick={() => setSelectedId(profile.id)}><span className="profile-import-card__icon"><ProfileIcon aria-hidden="true" /></span><span><strong>{profile.name}</strong><small>{profile.description}</small></span><b title={`${importableCount} élément${importableCount > 1 ? 's' : ''} à créer`}>{importableCount}</b></button> })}
            </div>
            <button className="profile-import-carousel__arrow profile-import-carousel__arrow--next" type="button" aria-label="Profil suivant" disabled={profiles.length < 2} onClick={() => selectProfileAt((selectedIndex + 1) % profiles.length)}><ChevronRight /></button>
          </div>}
          {selectedProfile && <ProfileImportPreview resourceType={resourceType} items={profileItems} duplicateKeys={duplicateKeys} selectedKeys={selectedKeys} onSelectionChange={setSelectedKeys} />}
        </div>
        <footer><button className="cv-home-action-button" type="button" onClick={onClose}>Annuler</button><button className="cv-home-action-button primary" type="button" disabled={!selectedId || selectedItems.length === 0 || isSubmitting} onClick={() => void submit()}><IconPackageImport stroke={1.8} aria-hidden="true" />{isSubmitting ? 'Import en cours…' : 'Importer'}</button></footer>
      </div>
    </div>, document.body,
  )
}

type ProfileResourceItem = StarterProfile['categories'][number] | StarterProfile['tags'][number] | StarterProfile['statuses'][number]

function ProfileImportPreview({ resourceType, items, duplicateKeys, selectedKeys, onSelectionChange }: { resourceType: StarterProfileResourceType; items: ProfileResourceItem[]; duplicateKeys: Set<string>; selectedKeys: Set<string>; onSelectionChange: (keys: Set<string>) => void }) {
  const labels = LABELS[resourceType]
  const selectedCount = items.filter((item) => selectedKeys.has(item.key) && !duplicateKeys.has(item.key)).length
  const skippedCount = duplicateKeys.size
  const toggle = (key: string) => {
    if (duplicateKeys.has(key)) return
    const next = new Set(selectedKeys)
    if (next.has(key)) next.delete(key); else next.add(key)
    onSelectionChange(next)
  }
  return <section className={`profile-import-preview profile-import-preview--${resourceType}`} aria-live="polite">
    <header><div><h3>Éléments à créer</h3><p>{selectedCount} {selectedCount === 1 ? labels.singular : labels.plural} sélectionné{labels.feminine ? (selectedCount > 1 ? 'es' : 'e') : (selectedCount > 1 ? 's' : '')}{skippedCount > 0 ? ` · ${skippedCount} déjà présent${skippedCount > 1 ? 's' : ''} ignoré${skippedCount > 1 ? 's' : ''}` : ''}</p></div><span>{selectedCount}</span></header>
    <ul>{items.map((item) => { const duplicate = duplicateKeys.has(item.key); const checked = !duplicate && selectedKeys.has(item.key); return <li key={item.key} className={duplicate ? 'is-duplicate' : ''}>
      <label>
        <input type="checkbox" checked={checked} disabled={duplicate} onChange={() => toggle(item.key)} />
        {resourceType === 'categories' && 'icon_id' in item && <CategoryIconPreview iconId={item.icon_id} size={18} showLabel={false} />}
        {resourceType !== 'categories' && 'color' in item && <span className="profile-import-preview__color" style={{ backgroundColor: item.color }} />}
        <span>{item.name}</span>
        {duplicate ? <small>Déjà présent</small> : resourceType === 'statuses' && 'functional_state' in item ? <small>{item.functional_state === 'visited' ? 'Visité' : 'Non visité'}</small> : null}
      </label>
    </li> })}</ul>
  </section>
}

function normalizeName(value: string): string {
  return value.normalize('NFKC').trim().toLocaleLowerCase()
}

type ExistingResource = { name: string; icon?: string; color?: string; functional_state?: 'non_visited' | 'visited' }

function isDuplicate(item: ProfileResourceItem, resourceType: StarterProfileResourceType, existingItems: ExistingResource[]): boolean {
  const name = normalizeName(item.name)
  if (resourceType === 'categories' && 'icon_id' in item) return existingItems.some((existing) => normalizeName(existing.name) === name && existing.icon === item.icon_id)
  return existingItems.some((existing) => normalizeName(existing.name) === name)
}

async function getExistingItems(mapId: string, resourceType: StarterProfileResourceType, signal: AbortSignal): Promise<ExistingResource[]> {
  if (resourceType === 'categories') return (await getCategories(signal, undefined, mapId)).map((item) => ({ name: item.name, icon: item.icon }))
  if (resourceType === 'tags') return (await getTags(signal, undefined, mapId)).map((item) => ({ name: item.name, color: item.color }))
  return (await getStatuses(mapId, signal)).map((item) => ({ name: item.name, color: item.color, functional_state: item.functional_state }))
}
