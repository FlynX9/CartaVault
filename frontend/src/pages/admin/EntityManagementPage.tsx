import { useEffect, useState } from 'react'
import { Plus } from 'lucide-react'

import { ApiError } from '../../api/client'
import { DeleteConfirmation } from '../../components/admin/DeleteConfirmation'
import { EntityForm, type EntityFormValues } from '../../components/admin/EntityForm'
import { EntityList, type ManagedEntity } from '../../components/admin/EntityList'
import { WorkspaceSearchField } from '../../components/admin/WorkspaceSearchField'
import { WorkspacePanelHeader } from '../../components/layout/WorkspacePanelHeader'
import { DEFAULT_CATEGORY_ICON_ID } from '../../icons/categoryIconCatalog'

export interface EntityManagementConfig {
  singularLabel: string
  pluralLabel: string
  supportsDescription: boolean
  supportsIcon?: boolean
  load: (signal: AbortSignal, q?: string) => Promise<ManagedEntity[]>
  save: (entity: ManagedEntity | null, values: EntityFormValues) => Promise<ManagedEntity>
  remove: (id: string) => Promise<void>
}

interface EntityManagementPageProps {
  config: EntityManagementConfig
  variant?: 'page' | 'panel'
  readOnly?: boolean
}

export function EntityManagementPage({ config, variant = 'page', readOnly = false }: EntityManagementPageProps) {
  const [queryInput, setQueryInput] = useState('')
  const [query, setQuery] = useState('')
  const [entities, setEntities] = useState<ManagedEntity[]>([])
  const [editing, setEditing] = useState<ManagedEntity | null | undefined>(undefined)
  const [deleting, setDeleting] = useState<ManagedEntity | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [refreshVersion, setRefreshVersion] = useState(0)

  useEffect(() => {
    const timeout = window.setTimeout(() => setQuery(queryInput.trim()), 300)
    return () => window.clearTimeout(timeout)
  }, [queryInput])

  useEffect(() => {
    const controller = new AbortController()
    setIsLoading(true)
    setError(null)
    void config.load(controller.signal, query || undefined)
      .then(setEntities)
      .catch((caught: unknown) => {
        if (!(caught instanceof Error && caught.name === 'AbortError')) {
          setError(caught instanceof Error ? caught.message : `Impossible de charger les ${config.pluralLabel}.`)
        }
      })
      .finally(() => { if (!controller.signal.aborted) setIsLoading(false) })
    return () => controller.abort()
  }, [config, query, refreshVersion])

  const submit = async (values: EntityFormValues) => {
    if (isSubmitting || readOnly) return
    setIsSubmitting(true); setError(null); setSuccess(null); setFieldErrors({})
    try {
      const saved = await config.save(editing ?? null, values)
      setEditing(undefined)
      setSuccess(`${saved.name} a bien été enregistré.`)
      setRefreshVersion((value) => value + 1)
    } catch (caught) {
      if (caught instanceof ApiError) {
        setFieldErrors(caught.fieldErrors)
        setError(caught.status === 409 ? `Ce nom existe déjà pour ${config.singularLabel}.` : caught.message)
      } else setError(caught instanceof Error ? caught.message : "L'enregistrement a échoué.")
    } finally { setIsSubmitting(false) }
  }

  const confirmDelete = async () => {
    if (deleting === null || isDeleting || readOnly) return
    setIsDeleting(true); setError(null); setSuccess(null)
    try {
      await config.remove(deleting.id)
      setEntities((current) => current.filter((entity) => entity.id !== deleting.id))
      setSuccess(`${deleting.name} a bien été supprimé.`)
      setDeleting(null)
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 404) {
        setEntities((current) => current.filter((entity) => entity.id !== deleting.id))
        setSuccess(`${deleting.name} avait déjà été supprimé.`)
        setDeleting(null)
      } else setError(caught instanceof ApiError && caught.status === 409 ? `La suppression de ${deleting.name} est bloquée par un conflit.` : caught instanceof Error ? caught.message : 'La suppression a échoué.')
    } finally { setIsDeleting(false) }
  }

  const create = () => { if (!readOnly) { setEditing(null); setFieldErrors({}); setError(null) } }
  const isPanel = variant === 'panel'
  const createAction = readOnly ? undefined : <button className="panel-icon-button primary" type="button" aria-label={`Créer ${config.singularLabel}`} title={`Créer ${config.singularLabel}`} onClick={create}><Plus size={18} /></button>

  return <section className={`admin-page${isPanel ? ' cv-management-panel' : ''}`}>
    {isPanel
      ? <WorkspacePanelHeader eyebrow="Organisation" title={config.pluralLabel} count={`${entities.length} élément${entities.length > 1 ? 's' : ''}`} action={createAction} />
      : <header className="admin-page-header"><div><h2>{config.pluralLabel}</h2></div>{!readOnly && <button className="primary-button" type="button" onClick={create}>Créer {config.singularLabel}</button>}</header>}
    {isPanel
      ? <WorkspaceSearchField value={queryInput} placeholder={`Rechercher ${config.singularLabel}`} onChange={setQueryInput} />
      : <label className="admin-search"><span>Rechercher dans les {config.pluralLabel.toLowerCase()}</span><input type="search" maxLength={100} value={queryInput} onChange={(event) => setQueryInput(event.target.value)} /></label>}
    {error && <div className="form-alert" role="alert">{error}</div>}
    {success && <p className="admin-success" role="status">{success}</p>}
    {!readOnly && editing !== undefined && <EntityForm key={editing?.id ?? 'new'} title={editing === null ? `Créer ${config.singularLabel}` : `Modifier ${editing.name}`} initialValues={{ name: editing?.name ?? '', description: editing?.description ?? '', icon: 'icon' in (editing ?? {}) ? editing?.icon as string : DEFAULT_CATEGORY_ICON_ID }} supportsDescription={config.supportsDescription} supportsIcon={config.supportsIcon} isSubmitting={isSubmitting} fieldErrors={fieldErrors} onCancel={() => setEditing(undefined)} onSubmit={submit} />}
    {!readOnly && deleting && <DeleteConfirmation entityName={deleting.name} isDeleting={isDeleting} onCancel={() => setDeleting(null)} onConfirm={() => void confirmDelete()} />}
    {!isPanel && <div className="admin-list-heading"><h3>Liste</h3><span aria-live="polite">{entities.length} résultat{entities.length > 1 ? 's' : ''}</span></div>}
    {isLoading ? <p role="status">Chargement…</p> : <EntityList variant={variant} entities={entities} emptyMessage={`Aucun élément dans les ${config.pluralLabel.toLowerCase()}.`} onEdit={setEditing} onDelete={setDeleting} readOnly={readOnly} />}
  </section>
}
