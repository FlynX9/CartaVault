import { useEffect, useMemo, useState } from 'react'
import { ArchiveRestore, MapPinned, MapPin, Route, Trash2 } from 'lucide-react'
import { IconMaximize, IconMinimize } from '@tabler/icons-react'

import { getTrash, permanentlyDeleteTrashItem, restoreTrashItem } from '../../api/trash'
import type { TrashItem, TrashItemType } from '../../types/trash'
import { useConfirmDialog } from '../common/useConfirmDialog'
import { useI18n } from '../../i18n/useI18n'
import { SkeletonList } from '../common/Skeleton'
import { EmptyState } from '../common/EmptyState'

interface Props {
  collapsed?: boolean
  onCollapsedChange?: (collapsed: boolean) => void
  onChanged?: () => void
}

const typeMeta: Record<TrashItemType, { labelKey: 'trash.type.map' | 'trash.type.place' | 'trash.type.trip'; Icon: typeof MapPin }> = {
  map: { labelKey: 'trash.type.map', Icon: MapPinned },
  place: { labelKey: 'trash.type.place', Icon: MapPin },
  trip: { labelKey: 'trash.type.trip', Icon: Route },
}

export function TrashWorkspacePanel({ collapsed = false, onCollapsedChange = () => undefined, onChanged = () => undefined }: Props) {
  const { confirm, confirmationDialog } = useConfirmDialog()
  const { t, formatDate } = useI18n()
  const [items, setItems] = useState<TrashItem[]>([])
  const [filter, setFilter] = useState<TrashItemType | 'all'>('all')
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const visibleItems = useMemo(() => filter === 'all' ? items : items.filter((item) => item.item_type === filter), [filter, items])

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError(null)
    void getTrash('all', controller.signal)
      .then(setItems)
      .catch((caught: unknown) => { if (!(caught instanceof Error && caught.name === 'AbortError')) setError(caught instanceof Error ? caught.message : t('trash.loadError')) })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [t])

  const restore = async (item: TrashItem) => {
    setBusyId(item.id); setError(null)
    try {
      await restoreTrashItem(item.item_type, item.id)
      setItems((current) => current.filter((entry) => entry.id !== item.id))
      onChanged()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('trash.restoreError'))
    } finally {
      setBusyId(null)
    }
  }

  const remove = async (item: TrashItem) => {
    const confirmed = await confirm({
      title: t('trash.confirmTitle', { name: item.name }),
      message: t('trash.confirmMessage'),
      confirmLabel: t('trash.deleteTitle'),
    })
    if (!confirmed) return
    setBusyId(item.id); setError(null)
    try {
      await permanentlyDeleteTrashItem(item.item_type, item.id)
      setItems((current) => current.filter((entry) => entry.id !== item.id))
      onChanged()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('trash.deleteError'))
    } finally {
      setBusyId(null)
    }
  }

  return <aside id="workspace-trash-panel" className={`country-place-panel trash-workspace-panel cv-workspace-panel${collapsed ? ' is-collapsed' : ''}`} aria-labelledby="trash-panel-title" tabIndex={-1}>
    <header className="cv-workspace-panel__header">
      <div className="cv-workspace-panel__heading">
        <p className="cv-workspace-panel__eyebrow">{t('trash.eyebrow')}</p>
        <div className="cv-workspace-panel__title-row">
          <h2 id="trash-panel-title" className="cv-workspace-panel__title">{t('trash.title')}</h2>
          <span className="cv-workspace-panel__count">{items.length}</span>
        </div>
      </div>
      <button className="panel-icon-button" type="button" aria-label={collapsed ? t('trash.expand') : t('trash.collapse')} onClick={() => onCollapsedChange(!collapsed)}>
        {collapsed ? <IconMaximize size={18} aria-hidden="true" /> : <IconMinimize size={18} aria-hidden="true" />}
      </button>
    </header>
    {!collapsed && <div className="trash-workspace-content cv-workspace-panel__content">
      <div className="trash-filter" role="group" aria-label={t('trash.filter')}>
        {([['all', 'trash.filter.all'], ['map', 'trash.filter.map'], ['place', 'trash.filter.place'], ['trip', 'trash.filter.trip']] as const).map(([value, label]) => <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)}>{t(label)}</button>)}
      </div>
      <p className="trash-retention-note">{t('trash.retention')}</p>
      {error && <p className="form-alert" role="alert">{error}</p>}
      {loading && items.length === 0 && <SkeletonList rows={4} label={t('trash.loading')} />}
      {!loading && visibleItems.length === 0 && <EmptyState className="trash-empty-state" icon={<Trash2 size={24} />} title={t('trash.empty')} />}
      {visibleItems.length > 0 && <ul className="trash-list">
        {visibleItems.map((item) => {
          const { Icon, labelKey } = typeMeta[item.item_type]
          return <li key={`${item.item_type}:${item.id}`}>
            <span className="trash-item-icon"><Icon size={17} /></span>
            <span className="trash-item-copy">
              <strong>{item.name}</strong>
              <small>{t(labelKey)}{item.map_name && item.item_type !== 'map' ? ` · ${item.map_name}` : ''}</small>
              <small>{t('trash.deletedAt', { date: formatDate(item.deleted_at, { dateStyle: 'medium' }), days: item.days_remaining })}</small>
            </span>
            <span className="trash-item-actions">
              <button type="button" disabled={busyId === item.id} aria-label={t('trash.restore', { name: item.name })} title={t('trash.restoreTitle')} onClick={() => void restore(item)}><ArchiveRestore size={16} /></button>
              <button className="danger" type="button" disabled={busyId === item.id} aria-label={t('trash.delete', { name: item.name })} title={t('trash.deleteTitle')} onClick={() => void remove(item)}><Trash2 size={16} /></button>
            </span>
          </li>
        })}
      </ul>}
    </div>}
    {confirmationDialog}
  </aside>
}
