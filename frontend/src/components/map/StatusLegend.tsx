import { useState } from 'react'
import { ListFilter, X } from 'lucide-react'

import type { PlaceStatusSummary } from '../../types/status'
import { useI18n } from '../../i18n/useI18n'

interface StatusLegendProps {
  statuses: PlaceStatusSummary[]
  panel?: boolean
  expanded?: boolean
  onExpandedChange?: (expanded: boolean) => void
  onClose?: () => void
}

/** Compact map overlay describing the colors currently used by markers. */
export function StatusLegend({ statuses, panel = false, expanded: controlledExpanded, onExpandedChange, onClose }: StatusLegendProps) {
  const { t } = useI18n()
  const [uncontrolledExpanded, setUncontrolledExpanded] = useState(false)
  const expanded = controlledExpanded ?? uncontrolledExpanded
  const setExpanded = onExpandedChange ?? setUncontrolledExpanded

  if (statuses.length === 0) return null

  if (panel) return (
    <section className="status-legend status-legend--expanded status-legend--panel" aria-label={t('map.legend.label')}>
      <header className="status-legend__panel-header cv-workspace-panel__header"><span><ListFilter size={17} aria-hidden="true" /><strong>{t('map.legend.title')}</strong></span>{onClose && <button className="map-panel-close-button" type="button" aria-label="Fermer la légende" title="Fermer" onClick={onClose}><X size={17} aria-hidden="true" /></button>}</header>
      <ul aria-hidden={false}>
        {statuses.map((status) => <li key={status.id}><span className="status-dot" style={{ backgroundColor: status.color }} aria-hidden="true" /><span>{status.name}</span></li>)}
      </ul>
    </section>
  )

  return (
    <section
      className={`status-legend ${expanded ? 'status-legend--expanded' : 'status-legend--collapsed'}`}
      aria-label={t('map.legend.label')}
      onMouseEnter={() => { if (controlledExpanded === undefined) setUncontrolledExpanded(true) }}
      onMouseLeave={() => { if (controlledExpanded === undefined) setUncontrolledExpanded(false) }}
      onFocus={() => { if (controlledExpanded === undefined) setUncontrolledExpanded(true) }}
    >
      <button className="status-legend__toggle" type="button" aria-expanded={expanded} aria-label={expanded ? t('map.legend.hide') : t('map.legend.show')} onClick={() => setExpanded(!expanded)}>
        <span><ListFilter size={16} aria-hidden="true" /><span className="status-legend__label">{t('map.legend.title')}</span></span>
      </button>
      {expanded && <ul aria-hidden={false}>
        {statuses.map((status) => (
          <li key={status.id}>
            <span className="status-dot" style={{ backgroundColor: status.color }} aria-hidden="true" />
            <span>{status.name}</span>
          </li>
        ))}
      </ul>}
    </section>
  )
}
