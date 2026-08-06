import { RotateCcw, Ruler, Undo2, X } from 'lucide-react'

import { useI18n } from '../../i18n/useI18n'
import type { MeasurementPoint } from './measurement'
import { formatMeasurementDistance, measurementTotal } from './measurement'

interface MapMeasurementControlProps {
  active: boolean
  points: readonly MeasurementPoint[]
  onToggle: () => void
  onUndo: () => void
  onReset: () => void
}

export function MapMeasurementControl({ active, points, onToggle, onUndo, onReset }: MapMeasurementControlProps) {
  const { locale, t } = useI18n()
  const total = measurementTotal(points)

  return <>
    <div className="map-overlay-control-slot map-overlay-control-slot--measurement">
      <button
        className={`map-measurement-toggle${active ? ' active' : ''}`}
        type="button"
        aria-label={active ? t('map.measure.disable') : t('map.measure.enable')}
        aria-pressed={active}
        title={active ? t('map.measure.disable') : t('map.measure.enable')}
        onClick={onToggle}
      >
        <Ruler size={18} aria-hidden="true" />
      </button>
    </div>
    {active && (
      <section
        className="map-measurement-panel"
        aria-label={t('map.measure.title')}
        onClick={(event) => event.stopPropagation()}
        onDoubleClick={(event) => event.stopPropagation()}
        onContextMenu={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <div className="map-measurement-panel__summary">
          <span>{t('map.measure.total')}</span>
          <strong>{formatMeasurementDistance(total, locale)}</strong>
          <small>{t('map.measure.points', { count: points.length })}</small>
        </div>
        <div className="map-measurement-panel__actions">
          <button type="button" disabled={points.length === 0} aria-label={t('map.measure.undo')} title={t('map.measure.undo')} onClick={onUndo}><Undo2 size={17} aria-hidden="true" /></button>
          <button type="button" disabled={points.length === 0} aria-label={t('map.measure.reset')} title={t('map.measure.reset')} onClick={onReset}><RotateCcw size={17} aria-hidden="true" /></button>
          <button type="button" aria-label={t('map.measure.disable')} title={t('map.measure.disable')} onClick={onToggle}><X size={17} aria-hidden="true" /></button>
        </div>
        <p>{points.length === 0 ? t('map.measure.helpFirst') : t('map.measure.helpNext')}</p>
      </section>
    )}
  </>
}
