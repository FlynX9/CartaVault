import { useEffect, useRef, useState, type FormEvent } from 'react'
import { CategoryIconField } from '../icons/CategoryIconField'

export interface EntityFormValues {
  name: string
  description: string
  icon?: string
  marksAsVisited?: boolean
}

interface EntityFormProps {
  title: string
  initialValues: EntityFormValues
  supportsDescription: boolean
  supportsIcon?: boolean
  supportsVisited?: boolean
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
  supportsVisited = false,
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
      {supportsIcon && <CategoryIconField value={values.icon} onChange={(icon) => setValues((current) => ({ ...current, icon }))} />}
      {supportsVisited && <label className="checkbox-field"><input type="checkbox" checked={values.marksAsVisited === true} onChange={(event) => setValues((current) => ({ ...current, marksAsVisited: event.target.checked }))} /><span>Cette catégorie marque le lieu comme visité</span></label>}
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
