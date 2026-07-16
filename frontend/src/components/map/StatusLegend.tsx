import { useState } from 'react'
import { ChevronDown, ChevronUp, ListFilter } from 'lucide-react'

import type { PlaceStatusSummary } from '../../types/status'

interface StatusLegendProps {
  statuses: PlaceStatusSummary[]
}

/** Compact map overlay describing the colors currently used by markers. */
export function StatusLegend({ statuses }: StatusLegendProps) {
  const [collapsed, setCollapsed] = useState(false)

  if (statuses.length === 0) return null

  if (collapsed) {
    return (
      <aside className="status-legend status-legend--collapsed" aria-label="Légende des statuts">
        <button type="button" aria-expanded="false" aria-label="Afficher la légende des statuts" onClick={() => setCollapsed(false)}>
          <ListFilter size={15} aria-hidden="true" />
          <span>Légende</span>
          <ChevronUp size={14} aria-hidden="true" />
        </button>
      </aside>
    )
  }

  return (
    <aside className="status-legend" aria-label="Légende des statuts">
      <button className="status-legend__toggle" type="button" aria-expanded="true" aria-label="Réduire la légende des statuts" onClick={() => setCollapsed(true)}>
        <span><ListFilter size={15} aria-hidden="true" />Légende</span>
        <ChevronDown size={15} aria-hidden="true" />
      </button>
      <ul>
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
