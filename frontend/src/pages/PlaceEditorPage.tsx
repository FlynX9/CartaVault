import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { getCategories } from '../api/categories'
import { ApiError } from '../api/client'
import { addPlaceCategory, addPlaceTag, createPlace, deletePlace, getPlaceDetails, refreshPlaceRegion, removePlaceCategory, removePlaceTag, restorePlace, setPrimaryPlaceCategory, updatePlace } from '../api/places'
import { getTags } from '../api/tags'
import { getStatuses } from '../api/statuses'
import { uploadPlacePhoto } from '../api/photos'
import { PhotoGalleryManager } from '../components/photos/PhotoGalleryManager'
import { PhotoUploader } from '../components/photos/PhotoUploader'
import { PlaceForm } from '../components/places/PlaceForm'
import { buildCreatePayload, buildMinimalUpdatePayload, calculateAssociationDiff, EMPTY_PLACE_FORM_VALUES, mergeApiFieldErrors, placeDetailsToFormValues } from '../forms/placeForm'
import type { PoiMap } from '../types/map'
import type { DraftPosition, PlaceCategory, PlaceDetails, PlaceFormErrors, PlaceFormValues, PlaceMutation, PlaceTag } from '../types/place'
import type { PlaceStatusSummary } from '../types/status'
import type { GeocodingResult } from '../geocoding/types'
import { withMap } from '../utils/map'
import { SkeletonList } from '../components/common/Skeleton'
import { useConfirmDialog } from '../components/common/useConfirmDialog'
import { announceWorkspaceChanged, recordReversibleAction } from '../ui/actionHistory'

interface Props { mode: 'create' | 'edit'; placeId?: string; embedded?: boolean; activeMapId?: string | null; activeStatusId?: string | null; maps: PoiMap[]; onPlaceMutated: (mutation: PlaceMutation) => void; geographicPrefill?: GeocodingResult | null; coordinatePrefill?: Pick<GeocodingResult, 'latitude' | 'longitude'> | null; draftPosition?: DraftPosition | null; onDraftPositionChange?: (position: DraftPosition | null) => void }
async function syncAssociations(placeId: string, initial: PlaceFormValues, current: PlaceFormValues) { const categories = calculateAssociationDiff(initial.categoryIds, current.categoryIds); const tags = calculateAssociationDiff(initial.tagIds, current.tagIds); for (const id of categories.added) await addPlaceCategory(placeId, id); for (const id of categories.removed) await removePlaceCategory(placeId, id); if (current.primaryCategoryId && current.primaryCategoryId !== initial.primaryCategoryId) await setPrimaryPlaceCategory(placeId, current.primaryCategoryId); for (const id of tags.added) await addPlaceTag(placeId, id); for (const id of tags.removed) await removePlaceTag(placeId, id) }

export function PlaceEditorPage({ mode, placeId: providedPlaceId, embedded = false, activeMapId = null, activeStatusId = null, maps, onPlaceMutated, geographicPrefill = null, coordinatePrefill = null, draftPosition = null, onDraftPositionChange = () => undefined }: Props) {
  const { placeId: routePlaceId } = useParams<{ placeId: string }>(); const placeId = providedPlaceId ?? routePlaceId; const navigate = useNavigate()
  const { confirm, confirmationDialog } = useConfirmDialog()
  const [initialValues, setInitialValues] = useState<PlaceFormValues | null>(null); const [categories, setCategories] = useState<PlaceCategory[]>([]); const [tags, setTags] = useState<PlaceTag[]>([]); const [statuses, setStatuses] = useState<PlaceStatusSummary[]>([]); const [pendingPhotos, setPendingPhotos] = useState<File[]>([]); const [createdPlaceId, setCreatedPlaceId] = useState<string | null>(null); const [loading, setLoading] = useState(true); const [submitting, setSubmitting] = useState(false); const [notFound, setNotFound] = useState(false); const [error, setError] = useState<string | null>(null); const [fieldErrors, setFieldErrors] = useState<PlaceFormErrors>({})
  const [regionDetails, setRegionDetails] = useState<PlaceDetails | null>(null)
  const [refreshedRegionBaseline, setRefreshedRegionBaseline] = useState<string | null | undefined>(undefined)
  useEffect(() => { if (mode !== 'create' || (geographicPrefill === null && coordinatePrefill === null)) return; setInitialValues((current) => { if (current === null) return current; if (coordinatePrefill !== null) { const latitude = String(coordinatePrefill.latitude); const longitude = String(coordinatePrefill.longitude); if (current.latitude === latitude && current.longitude === longitude) return current; return { ...current, latitude, longitude } } const latitude = geographicPrefill!.latitude.toFixed(6); const longitude = geographicPrefill!.longitude.toFixed(6); if (current.name === geographicPrefill!.name && current.latitude === latitude && current.longitude === longitude) return current; return { ...current, name: geographicPrefill!.name, latitude, longitude } }) }, [coordinatePrefill, geographicPrefill, initialValues, mode])
  useEffect(() => { if (mode !== 'edit' || initialValues === null) return; const latitude = Number(initialValues.latitude); const longitude = Number(initialValues.longitude); if (Number.isFinite(latitude) && Number.isFinite(longitude)) onDraftPositionChange({ latitude, longitude }) }, [initialValues, mode, onDraftPositionChange])
  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError(null)
    setNotFound(false)

    void (async () => {
      const place = mode === 'edit'
        ? placeId
          ? await getPlaceDetails(placeId, controller.signal)
          : await Promise.reject(new Error('Identifiant absent.'))
        : null
      const catalogMapId = place?.map_id ?? activeMapId
      const loadedStatuses = catalogMapId
        ? await getStatuses(catalogMapId, controller.signal, { activeOnly: true })
        : []

      if (controller.signal.aborted) return
      const selectableStatuses: PlaceStatusSummary[] = [...loadedStatuses]
      if (place && !place.status.is_active && !selectableStatuses.some((item) => item.id === place.status.id)) {
        selectableStatuses.push(place.status)
      }
      setStatuses(selectableStatuses)
      setRegionDetails(place)
      setRefreshedRegionBaseline(undefined)
      setInitialValues(place
        ? placeDetailsToFormValues(place)
        : { ...EMPTY_PLACE_FORM_VALUES, mapId: activeMapId ?? '', statusId: loadedStatuses.find((item) => item.is_default)?.id ?? '' })
      setLoading(false)

      // Les associations enrichissent le formulaire sans bloquer son affichage.
      const [categoriesResult, tagsResult] = await Promise.allSettled([
        getCategories(controller.signal, undefined, catalogMapId ?? undefined),
        getTags(controller.signal, undefined, catalogMapId ?? undefined),
      ])
      if (controller.signal.aborted) return
      if (categoriesResult.status === 'fulfilled') setCategories(categoriesResult.value)
      if (tagsResult.status === 'fulfilled') setTags(tagsResult.value)
    })()
      .catch((caught: unknown) => {
        if (controller.signal.aborted) return
        if (caught instanceof ApiError && caught.status === 404) setNotFound(true)
        else if (!(caught instanceof Error && caught.name === 'AbortError')) setError(caught instanceof Error ? caught.message : 'Préparation impossible.')
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })

    return () => controller.abort()
  }, [activeMapId, mode, placeId])
  const submit = async (values: PlaceFormValues) => {
    if (!initialValues) return
    setSubmitting(true)
    setError(null)
    setFieldErrors({})
    let savedId = mode === 'edit' ? placeId ?? null : createdPlaceId

    const persist = async (confirmOutsideCountry = false) => {
      if (mode === 'create' && savedId === null) {
        const created = await createPlace({
          ...buildCreatePayload(values),
          ...(confirmOutsideCountry ? { confirm_outside_country: true } : {}),
        })
        savedId = created.id
        setCreatedPlaceId(savedId)
      } else if (mode === 'edit' && placeId) {
        const updateBaseline = refreshedRegionBaseline === undefined
          ? initialValues
          : { ...initialValues, region: refreshedRegionBaseline ?? '' }
        const payload = buildMinimalUpdatePayload(updateBaseline, values)
        if (Object.keys(payload).length) {
          await updatePlace(placeId, {
            ...payload,
            ...(confirmOutsideCountry ? { confirm_outside_country: true } : {}),
          })
        }
      }
    }

    try {
      try {
        await persist()
      } catch (caught) {
        if (!(caught instanceof ApiError) || caught.code !== 'PLACE_OUTSIDE_MAP_COUNTRY') throw caught
        const approved = await confirm({
          title: 'POI hors du pays de la carte',
          message: caught.message,
          confirmLabel: 'Enregistrer quand même',
        })
        if (!approved) return
        await persist(true)
      }

      if (mode === 'create' && savedId) {
        const failed: File[] = []
        for (const file of pendingPhotos) {
          try {
            await uploadPlacePhoto(savedId, file)
          } catch {
            failed.push(file)
          }
        }
        setPendingPhotos(failed)
        if (failed.length) {
          setError(`Le POI a été créé, mais ${failed.length} photo(s) n’ont pas été envoyée(s).`)
          return
        }
      }
      if (!savedId) throw new Error('Identifiant absent.')
      await syncAssociations(savedId, initialValues, values)
      const historyPlaceId = savedId
      if (mode === 'create') {
        recordReversibleAction({
          label: `ajout du POI « ${values.name} »`,
          undo: async () => { await deletePlace(historyPlaceId); announceWorkspaceChanged() },
          redo: async () => { await restorePlace(historyPlaceId); announceWorkspaceChanged() },
        })
      } else if (JSON.stringify(initialValues) !== JSON.stringify(values)) {
        const forwardPayload = buildMinimalUpdatePayload(initialValues, values)
        const inversePayload = buildMinimalUpdatePayload(values, initialValues)
        recordReversibleAction({
          label: initialValues.mapId === values.mapId ? `modification du POI « ${values.name} »` : `déplacement du POI « ${values.name} »`,
          undo: async () => { if (Object.keys(inversePayload).length) await updatePlace(historyPlaceId, { ...inversePayload, confirm_outside_country: true }); await syncAssociations(historyPlaceId, values, initialValues); announceWorkspaceChanged() },
          redo: async () => { if (Object.keys(forwardPayload).length) await updatePlace(historyPlaceId, { ...forwardPayload, confirm_outside_country: true }); await syncAssociations(historyPlaceId, initialValues, values); announceWorkspaceChanged() },
        })
      }
      onPlaceMutated({ placeId: savedId, mapId: values.mapId })
      navigate(withMap(`/places/${savedId}`, values.mapId, activeStatusId))
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 422) {
        setFieldErrors(mergeApiFieldErrors({}, caught.fieldErrors))
        setError(caught.message)
      } else {
        setError(caught instanceof Error ? caught.message : 'Enregistrement impossible.')
      }
    } finally {
      setSubmitting(false)
    }
  }
  const recalculateRegion = async (): Promise<string | null> => {
    if (!placeId) throw new Error('Enregistrez d’abord le POI avant de recalculer sa région.')
    const refreshed = await refreshPlaceRegion(placeId)
    setRegionDetails(refreshed)
    setRefreshedRegionBaseline(refreshed.region)
    return refreshed.region
  }
  if (loading) return <section className="details-state"><SkeletonList rows={5} label="Chargement du formulaire" /></section>
  if (notFound) return <section className="details-state details-error"><h2>POI introuvable</h2><Link to={withMap('/', activeMapId)}>← Retour à la carte</Link></section>
  if (!initialValues) return <section className="details-state details-error" role="alert"><h2>Impossible d’afficher le formulaire</h2><p>{error}</p></section>
  return <><article className={`editor-page${embedded ? ' embedded' : ''}`}>{!embedded && <Link className="back-link" to={withMap('/', activeMapId)}>← Annuler</Link>}<header className="editor-header"><p className="details-kicker">{mode === 'create' ? 'Nouveau point d’intérêt' : 'Modification'}</p><h2>{mode === 'create' ? 'Ajouter un POI' : initialValues.name}</h2></header><PlaceForm initialValues={initialValues} maps={maps} allowMapChange={mode === 'edit'} categories={categories} tags={tags} statuses={statuses} submitLabel={mode === 'create' ? 'Créer le POI' : 'Enregistrer les modifications'} isSubmitting={submitting} serverErrors={fieldErrors} globalError={error} draftPosition={draftPosition} onDraftPositionChange={onDraftPositionChange} regionMetadata={regionDetails ? { manuallyOverridden: regionDetails.region_manually_overridden === true, resolvedAt: regionDetails.region_resolved_at ?? null } : null} onRefreshRegion={mode === 'edit' ? recalculateRegion : undefined} afterLocation={mode === 'create' ? <PhotoUploader files={pendingPhotos} onChange={setPendingPhotos} disabled={submitting} /> : mode === 'edit' && placeId ? <PhotoGalleryManager placeId={placeId} onChanged={() => onPlaceMutated({ placeId, mapId: initialValues.mapId })} /> : null} onSubmit={submit} /></article>{confirmationDialog}</>
}
