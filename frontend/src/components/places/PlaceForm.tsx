import { useState, type FormEvent } from 'react'

import { validatePlaceForm } from '../../forms/placeForm'
import type {
  PlaceCategory,
  PlaceFormErrors,
  PlaceFormValues,
  PlaceTag,
} from '../../types/place'
import type { PoiMap } from '../../types/map'
import type { PlaceStatusSummary } from '../../types/status'
import { LocationPicker } from '../map/LocationPicker'

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
}: PlaceFormProps) {
  const [values, setValues] = useState(initialValues)
  const [localErrors, setLocalErrors] = useState<PlaceFormErrors>({})
  const errors = { ...localErrors, ...serverErrors }

  const setValue = (field: keyof PlaceFormValues, value: string | string[]) => {
    setValues((current) => ({ ...current, [field]: value }))
    setLocalErrors((current) => ({ ...current, [field]: undefined }))
  }

  const toggleAssociation = (
    field: 'categoryIds' | 'tagIds',
    id: string,
  ) => {
    const ids = values[field]
    setValue(field, ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id])
  }

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    const validationErrors = validatePlaceForm(values)
    setLocalErrors(validationErrors)
    if (Object.keys(validationErrors).length === 0) void onSubmit(values)
  }

  const latitude = values.latitude.trim() === '' ? null : Number(values.latitude)
  const longitude = values.longitude.trim() === '' ? null : Number(values.longitude)
  const selectedStatus = statuses.find((item) => item.id === values.statusId)

  return (
    <form className="place-form" onSubmit={handleSubmit} noValidate>
      {globalError && <div className="form-alert" role="alert">{globalError}</div>}

      <section className="form-section">
        <h3>Informations générales</h3>
        <div className="form-grid">
          <label className="form-field">
            <span>Carte *</span>
            <select value={values.mapId} disabled={!allowMapChange} onChange={(event) => setValue('mapId', event.target.value)} aria-invalid={Boolean(errors.mapId)}>
              <option value="">Choisir une carte</option>
              {maps.map((poiMap) => <option key={poiMap.id} value={poiMap.id}>{poiMap.name} — {poiMap.country.name}</option>)}
            </select>
            {errors.mapId && <small className="field-error">{errors.mapId}</small>}
          </label>
          <label className="form-field">
            <span>Statut de suivi *</span>
            <select value={values.statusId} onChange={(event) => setValue('statusId', event.target.value)} aria-invalid={Boolean(errors.statusId)}>
              <option value="">Choisir un statut</option>
              {statuses.map((placeStatus) => <option key={placeStatus.id} value={placeStatus.id}>{placeStatus.name}{placeStatus.is_active ? '' : ' (inactif)'}</option>)}
            </select>
            {selectedStatus && <small className="place-status-label"><i className="status-dot" style={{ backgroundColor: selectedStatus.color }} />{selectedStatus.name}</small>}
            {errors.statusId && <small className="field-error">{errors.statusId}</small>}
          </label>
          {GENERAL_FIELDS.map(([field, label, maxLength]) => (
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
          <label className="form-field form-field-wide">
            <span>Description</span>
            <textarea value={values.description} rows={5} onChange={(event) => setValue('description', event.target.value)} />
          </label>
        </div>
      </section>

      <section className="form-section">
        <h3>Localisation</h3>
        <p className="form-hint">Saisissez les coordonnées, cliquez sur la carte ou déplacez le marqueur.</p>
        <div className="coordinate-grid">
          {(['latitude', 'longitude'] as const).map((field) => (
            <label className="form-field" key={field}>
              <span>{field === 'latitude' ? 'Latitude' : 'Longitude'} *</span>
              <input type="number" step="any" value={values[field]} onChange={(event) => setValue(field, event.target.value)} aria-invalid={Boolean(errors[field])} />
              {errors[field] && <small className="field-error">{errors[field]}</small>}
            </label>
          ))}
        </div>
        <LocationPicker
          latitude={Number.isFinite(latitude) ? latitude : null}
          longitude={Number.isFinite(longitude) ? longitude : null}
          onChange={(nextLatitude, nextLongitude) => {
            setValue('latitude', nextLatitude.toFixed(6))
            setValue('longitude', nextLongitude.toFixed(6))
          }}
        />
      </section>

      <section className="form-section">
        <h3>État et accès</h3>
        <div className="form-grid">
          {PRACTICAL_FIELDS.map(([field, label, maxLength]) => (
            <label className="form-field" key={field}>
              <span>{label}</span>
              <input value={values[field]} maxLength={maxLength} onChange={(event) => setValue(field, event.target.value)} aria-invalid={Boolean(errors[field])} />
              {errors[field] && <small className="field-error">{errors[field]}</small>}
            </label>
          ))}
        </div>
      </section>

      <section className="form-section">
        <h3>Chronologie</h3>
        <div className="form-grid">
          {CHRONOLOGY_FIELDS.map(([field, label, maxLength]) => (
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
      </section>

      <section className="form-section association-grid">
        <fieldset>
          <legend>Catégories</legend>
          {categories.length === 0 ? <p className="form-hint">Aucune catégorie disponible.</p> : categories.map((category) => (
            <label className="checkbox-field" key={category.id}>
              <input type="checkbox" checked={values.categoryIds.includes(category.id)} onChange={() => toggleAssociation('categoryIds', category.id)} />
              <span>{category.name}</span>
            </label>
          ))}
        </fieldset>
        <fieldset>
          <legend>Tags</legend>
          {tags.length === 0 ? <p className="form-hint">Aucun tag disponible.</p> : tags.map((tag) => (
            <label className="checkbox-field" key={tag.id}>
              <input type="checkbox" checked={values.tagIds.includes(tag.id)} onChange={() => toggleAssociation('tagIds', tag.id)} />
              <span>{tag.name}</span>
            </label>
          ))}
        </fieldset>
      </section>

      <button className="primary-button" type="submit" disabled={isSubmitting}>
        {isSubmitting ? 'Enregistrement…' : submitLabel}
      </button>
    </form>
  )
}
