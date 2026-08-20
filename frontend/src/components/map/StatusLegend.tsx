import { useState } from 'react'
import { ListFilter } from 'lucide-react'

import type { PlaceStatusSummary } from '../../types/status'
import { useI18n } from '../../i18n/useI18n'

interface StatusLegendProps {
  statuses: PlaceStatusSummary[]
  expanded?: boolean
  onExpandedChange?: (expanded: boolean) => void
}

/** Compact map overlay describing the colors currently used by markers. */
export function StatusLegend({ statuses, expanded: controlledExpanded, onExpandedChange }: StatusLegendProps) {
  const { t } = useI18n()
  const [uncontrolledExpanded, setUncontrolledExpanded] = useState(false)
  const expanded = controlledExpanded ?? uncontrolledExpanded
  const setExpanded = onExpandedChange ?? setUncontrolledExpanded

  if (statuses.length === 0) return null

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
