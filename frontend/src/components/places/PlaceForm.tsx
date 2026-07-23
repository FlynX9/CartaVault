import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { ChevronDown, X } from 'lucide-react'

import { validatePlaceForm } from '../../forms/placeForm'
import type {
  PlaceCategory,
  PlaceFormErrors,
  PlaceFormValues,
  PlaceTag,
} from '../../types/place'
import type { PoiMap } from '../../types/map'
import type { PlaceStatusSummary } from '../../types/status'
import type { DraftPosition } from '../../types/place'
import { CategoryIconPreview } from '../icons/CategoryIconPreview'
import { getTagColorStyle } from '../../tags/tagColors'

interface PlaceFormProps {
  initialValues: PlaceFormValues
  categories: PlaceCategory[]
  tags: PlaceTag[]
  maps: PoiMap[]
  statuses?: PlaceStatusSummary[]
  allowMapChange: boolean
  submitLabel: string
  isSubmitting: boolean
  serverErrors?: PlaceFormErrors
  globalError?: string | null
  onSubmit: (values: PlaceFormValues) => Promise<void>
  draftPosition?: DraftPosition | null
  onDraftPositionChange?: (position: DraftPosition) => void
  afterLocation?: ReactNode
}

const GENERAL_FIELDS = [
  ['name', 'Nom', 255],
  ['region', 'Région', 100],
] as const

const PRACTICAL_FIELDS = [
  ['condition', 'État', 50],
  ['access', 'Accès', 50],
  ['danger_level', 'Niveau de danger', 50],
] as const

const CHRONOLOGY_FIELDS = [
  ['construction_date', 'Construction', 100],
  ['abandonment_date', 'Abandon', 100],
] as const

export function PlaceForm({
  initialValues,
  categories,
  tags,
  maps,
  statuses = [],
  allowMapChange,
  submitLabel,
  isSubmitting,
  serverErrors = {},
  globalError,
  onSubmit,
  draftPosition = null,
  onDraftPositionChange = () => undefined,
  afterLocation = null,
}: PlaceFormProps) {
  const [values, setValues] = useState(initialValues)
  const [localErrors, setLocalErrors] = useState<PlaceFormErrors>({})
  const [statusMenuOpen, setStatusMenuOpen] = useState(false)
  const [categoryMenuOpen, setCategoryMenuOpen] = useState(false)
  const [tagMenuOpen, setTagMenuOpen] = useState(false)
  const [tagQuery, setTagQuery] = useState('')
  const errors = { ...localErrors, ...serverErrors }

  useEffect(() => {
    setValues(initialValues)
  }, [initialValues])

  useEffect(() => {
    if (draftPosition === null) return
    setValues((current) => ({ ...current, latitude: String(draftPosition.latitude), longitude: String(draftPosition.longitude) }))
  }, [draftPosition])

  const setValue = (field: keyof PlaceFormValues, value: string | string[] | boolean) => {
    setValues((current) => {
      const next = { ...current, [field]: value }
      if (field === 'latitude' || field === 'longitude') {
        const latitude = Number(next.latitude)
        const longitude = Number(next.longitude)
        if (next.latitude.trim() !== '' && next.longitude.trim() !== '' && Number.isFinite(latitude) && Number.isFinite(longitude) && latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180) onDraftPositionChange({ latitude, longitude })
      }
      return next
    })
    setLocalErrors((current) => ({ ...current, [field]: undefined }))
  }

  const selectAssociation = (field: 'categoryIds' | 'tagIds', id: string) => {
    setValue(field, id ? [id] : [])
    if (field === 'categoryIds') setValue('primaryCategoryId', id)
  }
  const toggleTag = (id: string) => setValue('tagIds', values.tagIds.includes(id) ? values.tagIds.filter((tagId) => tagId !== id) : [...values.tagIds, id])

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    const validationErrors = validatePlaceForm(values)
    setLocalErrors(validationErrors)
    if (Object.keys(validationErrors).length === 0) void onSubmit(values)
  }

  const latitude = values.latitude.trim() === '' ? null : Number(values.latitude)
  const longitude = values.longitude.trim() === '' ? null : Number(values.longitude)
  const selectedStatus = statuses.find((item) => item.id === values.statusId)
  const selectedMap = maps.find((item) => item.id === values.mapId)
  const fieldEnabled = (field: string) => selectedMap?.place_field_config?.[field] !== false
  const selectedCategory = categories.find((item) => item.id === values.categoryIds[0])
  const selectableStatuses = statuses.filter((item) => item.slug !== 'importe')
  const selectableCategories = categories.filter((item) => item.name !== 'Importé')
  const visibleTags = tags.filter((tag) => tag.name.toLocaleLowerCase().includes(tagQuery.trim().toLocaleLowerCase())).slice(0, 10)

  return (
    <form className="place-form" onSubmit={handleSubmit} noValidate>
      {globalError && <div className="form-alert" role="alert">{globalError}</div>}

      <section className="form-section form-section--general">
        <div className="form-section-heading">
          <div>
            <p className="form-section-eyebrow">Le lieu</p>
            <h3>Informations générales</h3>
          </div>
          <p>Identité, classement et suivi</p>
        </div>
        <div className="form-grid">
          <label className="form-field">
            <span>Carte *</span>
            <select value={values.mapId} disabled={!allowMapChange} onChange={(event) => setValue('mapId', event.target.value)} aria-invalid={Boolean(errors.mapId)}>
              <option value="">Choisir une carte</option>
              {maps.map((poiMap) => <option key={poiMap.id} value={poiMap.id}>{poiMap.name} — {poiMap.country.name}</option>)}
            </select>
            {errors.mapId && <small className="field-error">{errors.mapId}</small>}
          </label>
          <label className="form-field status-field">
            <span>Statut de suivi *</span>
            <div className="status-picker"><button type="button" className="status-picker-trigger" aria-haspopup="listbox" aria-expanded={statusMenuOpen} onClick={() => setStatusMenuOpen((open) => !open)}><i className="status-dot" style={{ backgroundColor: selectedStatus?.color ?? 'transparent' }} aria-hidden="true" /><span>{selectedStatus?.name ?? 'Choisir un statut'}</span><ChevronDown aria-hidden="true" size={18} /></button>{statusMenuOpen && <div className="status-picker-options" role="listbox" aria-label="Statut de suivi">{selectableStatuses.map((placeStatus) => <button key={placeStatus.id} type="button" role="option" aria-selected={placeStatus.id === values.statusId} onClick={() => { setValue('statusId', placeStatus.id); setStatusMenuOpen(false) }}><i className="status-dot" style={{ backgroundColor: placeStatus.color }} aria-hidden="true" />{placeStatus.name}{placeStatus.is_active ? '' : ' (inactif)'}</button>)}</div>}</div>
            {errors.statusId && <small className="field-error">{errors.statusId}</small>}
          </label>
          {GENERAL_FIELDS.filter(([field]) => field === 'name' || fieldEnabled(field)).map(([field, label, maxLength]) => (
            <label className="form-field" key={field}>
              <span>{label}{field === 'name' ? ' *' : ''}</span>
              <input
                value={values[field]}
                maxLength={maxLength}
                onChange={(event) => setValue(field, event.target.value)}
                aria-invalid={Boolean(errors[field])}
              />
              {errors[field] && <small className="field-error">{errors[field]}</small>}
            </label>
          ))}
          {fieldEnabled('description') && <label className="form-field form-field-wide general-description">
            <span>Description</span>
            <textarea value={values.description} rows={5} onChange={(event) => setValue('description', event.target.value)} />
          </label>}
          {fieldEnabled('favorite') && <label className="form-field favorite-field"><span>Favori</span><input type="checkbox" checked={values.isFavorite} onChange={(event) => setValue('isFavorite', event.target.checked)} /></label>}
          {fieldEnabled('ratings') && <div className="form-field form-field-wide place-rating-fields"><span>Notation</span><label>Envie avant visite<select value={values.interestRating} onChange={(event) => setValue('interestRating', event.target.value)}><option value="">Aucune note</option>{[1, 2, 3, 4, 5].map((rating) => <option key={rating} value={rating}>{rating} étoile{rating > 1 ? 's' : ''}</option>)}</select></label><label>Évaluation après visite<select value={values.visitRating} onChange={(event) => setValue('visitRating', event.target.value)}><option value="">Aucune note</option>{[1, 2, 3, 4, 5].map((rating) => <option key={rating} value={rating}>{rating} étoile{rating > 1 ? 's' : ''}</option>)}</select></label></div>}
          <label className="form-field category-field">
            <span>Catégorie</span>
            <div className="status-picker"><button type="button" className="status-picker-trigger" aria-haspopup="listbox" aria-expanded={categoryMenuOpen} onClick={() => setCategoryMenuOpen((open) => !open)}>{selectedCategory ? <CategoryIconPreview iconId={selectedCategory.icon} size={17} showLabel={false} /> : <span className="category-picker-placeholder" />}<span>{selectedCategory?.name ?? 'Aucune catégorie'}</span><ChevronDown aria-hidden="true" size={18} /></button>{categoryMenuOpen && <div className="status-picker-options category-picker-options" role="listbox" aria-label="Catégorie">{selectableCategories.map((category) => <button key={category.id} type="button" role="option" aria-selected={category.id === selectedCategory?.id} onClick={() => { selectAssociation('categoryIds', category.id); setCategoryMenuOpen(false) }}><CategoryIconPreview iconId={category.icon} size={17} showLabel={false} />{category.name}</button>)}</div>}</div>
            {categories.length === 0 && <small className="form-hint">Aucune catégorie disponible.</small>}
          </label>
          <label className="form-field tag-field">
            <span>Tags</span>
            <div className="status-picker"><button type="button" className="status-picker-trigger" aria-haspopup="listbox" aria-expanded={tagMenuOpen} onClick={() => setTagMenuOpen((open) => !open)}><span className="status-picker-spacer" /><span>{values.tagIds.length ? `${values.tagIds.length} tag${values.tagIds.length > 1 ? 's' : ''} sélectionné${values.tagIds.length > 1 ? 's' : ''}` : 'Ajouter des tags'}</span><ChevronDown aria-hidden="true" size={18} /></button>{tagMenuOpen && <div className="status-picker-options tag-picker-options" role="listbox" aria-label="Tags"><input type="search" autoFocus placeholder="Rechercher un tag" value={tagQuery} onChange={(event) => setTagQuery(event.target.value)} />{visibleTags.map((tag) => <button key={tag.id} type="button" role="option" aria-selected={values.tagIds.includes(tag.id)} onClick={() => toggleTag(tag.id)}>{tag.name}</button>)}</div>}</div>
            {values.tagIds.length > 0 && <div className="selected-tag-list" aria-label="Tags sélectionnés">{values.tagIds.map((tagId) => { const tag = tags.find((item) => item.id === tagId); return tag ? <span key={tag.id} style={getTagColorStyle(tag.color)}>{tag.name}<button type="button" aria-label={`Retirer ${tag.name}`} onClick={() => toggleTag(tag.id)}><X aria-hidden="true" size={13} /></button></span> : null })}</div>}
            {tags.length === 0 && <small className="form-hint">Aucun tag disponible.</small>}
          </label>
        </div>
      </section>

      <section className="form-section form-section--location">
        <div className="form-section-heading">
          <div>
            <p className="form-section-eyebrow">Position</p>
            <h3>Localisation</h3>
          </div>
        </div>
        <p className="form-hint">Déplacez le marqueur sur la carte principale ou saisissez les coordonnées.</p>
        <div className="coordinate-grid">
          {(['latitude', 'longitude'] as const).map((field) => (
            <label className="form-field" key={field}>
              <span>{field === 'latitude' ? 'Latitude' : 'Longitude'} *</span>
              <input type="number" step="any" value={values[field]} onChange={(event) => setValue(field, event.target.value)} aria-invalid={Boolean(errors[field])} />
              {errors[field] && <small className="field-error">{errors[field]}</small>}
            </label>
          ))}
        </div>
        <p className="draft-position-status" aria-live="polite">{Number.isFinite(latitude) && Number.isFinite(longitude) ? `Position en cours : ${latitude}, ${longitude}` : 'Saisissez des coordonnées valides pour afficher le marqueur.'}</p>
      </section>

      {afterLocation}

      <details className="form-section form-section-collapsible">
        <summary><span>État</span><ChevronDown aria-hidden="true" size={18} /></summary>
        <div className="form-grid">
          {PRACTICAL_FIELDS.filter(([field]) => field !== 'access' && fieldEnabled(field)).map(([field, label, maxLength]) => (
            <label className="form-field" key={field}>
              <span>{label}</span>
              <input value={values[field]} maxLength={maxLength} onChange={(event) => setValue(field, event.target.value)} aria-invalid={Boolean(errors[field])} />
              {errors[field] && <small className="field-error">{errors[field]}</small>}
            </label>
          ))}
        </div>
      </details>

      <details className="form-section form-section-collapsible">
        <summary><span>Accès</span><ChevronDown aria-hidden="true" size={18} /></summary>
        <div className="form-grid">
          {PRACTICAL_FIELDS.filter(([field]) => field === 'access' && fieldEnabled(field)).map(([field, label, maxLength]) => (
            <label className="form-field" key={field}>
              <span>{label}</span>
              <input value={values[field]} maxLength={maxLength} onChange={(event) => setValue(field, event.target.value)} aria-invalid={Boolean(errors[field])} />
              {errors[field] && <small className="field-error">{errors[field]}</small>}
            </label>
          ))}
        </div>
      </details>

      <details className="form-section form-section-collapsible">
        <summary><span>Chronologie</span><ChevronDown aria-hidden="true" size={18} /></summary>
        <div className="form-grid">
          {CHRONOLOGY_FIELDS.filter(([field]) => fieldEnabled(field)).map(([field, label, maxLength]) => (
            <label className="form-field" key={field}>
              <span>{label}</span>
              <input
                value={values[field]}
                maxLength={maxLength}
                onChange={(event) => setValue(field, event.target.value)}
                aria-invalid={Boolean(errors[field])}
              />
              {errors[field] && (
                <small className="field-error">{errors[field]}</small>
              )}
            </label>
          ))}
        </div>
      </details>

      <div className="place-form-submit">
        <button className="primary-button" type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Enregistrement…' : submitLabel}
        </button>
      </div>
    </form>
  )
}
