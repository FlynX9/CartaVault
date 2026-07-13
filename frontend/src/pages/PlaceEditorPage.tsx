import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'

import { getCategories } from '../api/categories'
import { ApiError } from '../api/client'
import {
  addPlaceCategory,
  addPlaceTag,
  createPlace,
  getPlaceDetails,
  removePlaceCategory,
  removePlaceTag,
  updatePlace,
} from '../api/places'
import { getTags } from '../api/tags'
import { PlaceForm } from '../components/places/PlaceForm'
import {
  buildCreatePayload,
  buildMinimalUpdatePayload,
  calculateAssociationDiff,
  EMPTY_PLACE_FORM_VALUES,
  mergeApiFieldErrors,
  placeDetailsToFormValues,
} from '../forms/placeForm'
import type {
  PlaceCategory,
  PlaceFormErrors,
  PlaceFormValues,
  PlaceTag,
} from '../types/place'

interface PlaceEditorPageProps {
  mode: 'create' | 'edit'
  placeId?: string
  embedded?: boolean
  onPlaceMutated: () => void
}

async function syncAssociations(
  placeId: string,
  initial: PlaceFormValues,
  current: PlaceFormValues,
): Promise<void> {
  const categories = calculateAssociationDiff(initial.categoryIds, current.categoryIds)
  const tags = calculateAssociationDiff(initial.tagIds, current.tagIds)
  for (const id of categories.added) await addPlaceCategory(placeId, id)
  for (const id of categories.removed) await removePlaceCategory(placeId, id)
  for (const id of tags.added) await addPlaceTag(placeId, id)
  for (const id of tags.removed) await removePlaceTag(placeId, id)
}

export function PlaceEditorPage({ mode, placeId: providedPlaceId, embedded = false, onPlaceMutated }: PlaceEditorPageProps) {
  const { placeId: routePlaceId } = useParams<{ placeId: string }>()
  const placeId = providedPlaceId ?? routePlaceId
  const navigate = useNavigate()
  const [initialValues, setInitialValues] = useState<PlaceFormValues | null>(null)
  const [categories, setCategories] = useState<PlaceCategory[]>([])
  const [tags, setTags] = useState<PlaceTag[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isNotFound, setIsNotFound] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<PlaceFormErrors>({})
  const [partialPlaceId, setPartialPlaceId] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    const placeRequest = mode === 'edit'
      ? placeId === undefined
        ? Promise.reject(new Error("L'identifiant du POI est absent."))
        : getPlaceDetails(placeId, controller.signal)
      : Promise.resolve(null)

    void Promise.all([
      getCategories(controller.signal),
      getTags(controller.signal),
      placeRequest,
    ])
      .then(([loadedCategories, loadedTags, place]) => {
        setCategories(loadedCategories)
        setTags(loadedTags)
        setInitialValues(place === null ? { ...EMPTY_PLACE_FORM_VALUES } : placeDetailsToFormValues(place))
      })
      .catch((caught: unknown) => {
        if (caught instanceof Error && caught.name === 'AbortError') return
        if (caught instanceof ApiError && caught.status === 404) setIsNotFound(true)
        else setError(caught instanceof Error ? caught.message : 'Impossible de préparer le formulaire.')
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false)
      })
    return () => controller.abort()
  }, [mode, placeId])

  const submit = async (values: PlaceFormValues) => {
    if (initialValues === null) return
    setIsSubmitting(true)
    setError(null)
    setFieldErrors({})
    setPartialPlaceId(null)
    let savedPlaceId: string | null = mode === 'edit' ? placeId ?? null : null

    try {
      if (mode === 'create') {
        const created = await createPlace(buildCreatePayload(values))
        savedPlaceId = created.id
      } else if (placeId !== undefined) {
        const payload = buildMinimalUpdatePayload(initialValues, values)
        if (Object.keys(payload).length > 0) await updatePlace(placeId, payload)
      }

      if (savedPlaceId === null) throw new Error("L'identifiant du POI enregistré est absent.")
      await syncAssociations(savedPlaceId, initialValues, values)
      onPlaceMutated()
      navigate(`/places/${savedPlaceId}`)
    } catch (caught) {
      if (mode === 'create' && savedPlaceId !== null) {
        setPartialPlaceId(savedPlaceId)
      }

      if (caught instanceof ApiError && caught.status === 422) {
        setFieldErrors(mergeApiFieldErrors({}, caught.fieldErrors))
        setError(caught.message)
      } else {
        setError(caught instanceof Error ? caught.message : "L'enregistrement a échoué.")
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  if (isLoading) return <section className="details-state" role="status">Chargement du formulaire…</section>
  if (isNotFound) return <section className="details-state details-error"><h2>POI introuvable</h2><Link to="/">← Retour à la carte</Link></section>
  if (initialValues === null) return <section className="details-state details-error" role="alert"><h2>Impossible d’afficher le formulaire</h2><p>{error}</p><Link to="/">← Retour à la carte</Link></section>

  const globalError = partialPlaceId === null ? error : `${error ?? 'Certaines associations ont échoué.'} Le POI principal a bien été créé.`

  return (
    <article className={`editor-page${embedded ? ' embedded' : ''}`}>
      {!embedded && <div className="details-toolbar"><Link className="back-link" to={mode === 'edit' && placeId ? `/places/${placeId}` : '/'}>← Annuler</Link></div>}
      <header className="editor-header">
        <p className="details-kicker">{mode === 'create' ? 'Nouveau point d’intérêt' : 'Modification'}</p>
        <h2>{mode === 'create' ? 'Ajouter un POI' : initialValues.name}</h2>
      </header>
      {partialPlaceId && <p className="partial-save-link"><Link to={`/places/${partialPlaceId}`}>Ouvrir le POI créé</Link></p>}
      <PlaceForm initialValues={initialValues} categories={categories} tags={tags} submitLabel={mode === 'create' ? 'Créer le POI' : 'Enregistrer les modifications'} isSubmitting={isSubmitting} serverErrors={fieldErrors} globalError={globalError} onSubmit={submit} />
    </article>
  )
}
