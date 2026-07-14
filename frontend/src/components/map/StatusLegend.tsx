import type { PlaceStatusSummary } from '../../types/status'

interface StatusLegendProps {
  statuses: PlaceStatusSummary[]
}

/** Compact map overlay describing the colors currently used by markers. */
export function StatusLegend({ statuses }: StatusLegendProps) {
  if (statuses.length === 0) return null

  return (
    <aside className="status-legend" aria-label="Légende des statuts">
      <strong>Statuts</strong>
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
