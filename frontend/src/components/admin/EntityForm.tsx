import { useEffect, useRef, useState, type FormEvent } from 'react'
import { CATEGORY_ICON_IDS } from '../categories/categoryIconCatalog'
import { CategoryIcon } from '../categories/categoryIcons'

export interface EntityFormValues {
  name: string
  description: string
  icon?: string
}

interface EntityFormProps {
  title: string
  initialValues: EntityFormValues
  supportsDescription: boolean
  supportsIcon?: boolean
  isSubmitting: boolean
  fieldErrors: Partial<Record<keyof EntityFormValues, string>>
  onCancel: () => void
  onSubmit: (values: EntityFormValues) => Promise<void>
}

export function EntityForm({
  title,
  initialValues,
  supportsDescription,
  supportsIcon = false,
  isSubmitting,
  fieldErrors,
  onCancel,
  onSubmit,
}: EntityFormProps) {
  const [values, setValues] = useState(initialValues)
  const [nameError, setNameError] = useState<string | null>(null)
  const nameInput = useRef<HTMLInputElement>(null)

  useEffect(() => nameInput.current?.focus(), [])

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (isSubmitting) return
    const name = values.name.trim()
    if (name === '') {
      setNameError('Le nom est obligatoire.')
      return
    }
    if (name.length > 100) {
      setNameError('Le nom ne doit pas dépasser 100 caractères.')
      return
    }
    setNameError(null)
    void onSubmit({ ...values, name })
  }

  const displayedNameError = fieldErrors.name ?? nameError

  return (
    <form className="admin-form" onSubmit={submit} noValidate>
      <h3>{title}</h3>
      <label className="form-field">
        <span>Nom *</span>
        <input
          ref={nameInput}
          value={values.name}
          maxLength={100}
          aria-invalid={Boolean(displayedNameError)}
          onChange={(event) => {
            setValues((current) => ({ ...current, name: event.target.value }))
            setNameError(null)
          }}
        />
        {displayedNameError && <small className="field-error">{displayedNameError}</small>}
      </label>
      {supportsDescription && (
        <label className="form-field">
          <span>Description</span>
          <textarea
            rows={5}
            value={values.description}
            onChange={(event) => setValues((current) => ({ ...current, description: event.target.value }))}
          />
          {fieldErrors.description && <small className="field-error">{fieldErrors.description}</small>}
        </label>
      )}
      {supportsIcon && <fieldset className="icon-picker"><legend>Icône</legend><div role="radiogroup" aria-label="Icône de catégorie">{CATEGORY_ICON_IDS.map((icon) => <label key={icon}><input type="radio" name="category-icon" value={icon} checked={(values.icon ?? 'map-pin') === icon} onChange={() => setValues((current) => ({ ...current, icon }))} /><CategoryIcon icon={icon} /><span>{icon}</span></label>)}</div></fieldset>}
      <div className="admin-form-actions">
        <button className="primary-button" type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Enregistrement…' : 'Enregistrer'}
        </button>
        <button className="secondary-button" type="button" disabled={isSubmitting} onClick={onCancel}>
          Annuler
        </button>
      </div>
    </form>
  )
}
