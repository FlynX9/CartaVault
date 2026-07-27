import { useState } from 'react'
import { ListFilter } from 'lucide-react'

import type { PlaceStatusSummary } from '../../types/status'
import { useI18n } from '../../i18n/useI18n'

interface StatusLegendProps {
  statuses: PlaceStatusSummary[]
}

/** Compact map overlay describing the colors currently used by markers. */
export function StatusLegend({ statuses }: StatusLegendProps) {
  const { t } = useI18n()
  const [expanded, setExpanded] = useState(false)

  if (statuses.length === 0) return null

  return (
    <aside
      className={`status-legend ${expanded ? 'status-legend--expanded' : 'status-legend--collapsed'}`}
      aria-label={t('map.legend.label')}
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => setExpanded(false)}
      onFocus={() => setExpanded(true)}
      onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setExpanded(false) }}
    >
      <button className="status-legend__toggle" type="button" aria-expanded={expanded} aria-label={expanded ? t('map.legend.hide') : t('map.legend.show')} onClick={() => setExpanded(true)}>
        <span><ListFilter size={16} aria-hidden="true" /><span className="status-legend__label">{t('map.legend.title')}</span></span>
      </button>
      <ul aria-hidden={!expanded}>
        {statuses.map((status) => (
          <li key={status.id}>
            <span className="status-dot" style={{ backgroundColor: status.color }} aria-hidden="true" />
            <span>{status.name}</span>
          </li>
        ))}
      </ul>
    </aside>
  )
}
