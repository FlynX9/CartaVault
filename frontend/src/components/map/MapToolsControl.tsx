import { useState } from 'react'
import { Copy, Crosshair, LocateFixed, Map as MapIcon, Maximize2, Minimize2, MousePointer2, PenTool, RotateCcw, Ruler, Scan, Undo2 } from 'lucide-react'

import { useI18n } from '../../i18n/useI18n'
import type { MapExtent } from './mapExtent'
import { formatMapArea, mapExtentArea, mapExtentDimensions } from './mapExtent'
import type { InternalMapToolMode, InteractiveMapMode } from './mapToolMode'
import type { MeasurementPoint } from './measurement'
import { formatMeasurementDistance, measurementTotal } from './measurement'

interface MapToolsControlProps {
  mode: InteractiveMapMode
  internalMode: InternalMapToolMode
  measurementPoints: readonly MeasurementPoint[]
  extent: MapExtent | null
  coordinate: MeasurementPoint | null
  selectedCount: number
  areaCandidateCount: number
  selectionStrategy: 'replace' | 'add'
  fullscreen: boolean
  geolocationLoading: boolean
  notice: string | null
  canCreate: boolean
  canUseInternalTools: boolean
  hasVisiblePlaces: boolean
  hasSelectedPlaces: boolean
  hasTrip: boolean
  hasActiveDay: boolean
  onModeChange: (mode: InternalMapToolMode) => void
  onUndoMeasurement: () => void
  onReset: () => void
  onSelectionStrategyChange: (strategy: 'replace' | 'add') => void
  onApplyAreaSelection: () => void
  onCopyExtent: () => void
  onFitVisible: () => void
  onFitSelection: () => void
  onFitTrip: () => void
  onFitDay: () => void
  onToggleFullscreen: () => void
  onRequestGeolocation: () => void
  onCopyCoordinates: () => void
  onCreateAtCoordinate: () => void
}

const modeIcons: Record<Exclude<InternalMapToolMode, 'navigation' | 'geolocation'>, typeof Ruler> = {
  measurement: Ruler,
  'area-selection': Scan,
  'extent-drawing': PenTool,
  coordinates: Crosshair,
}

export function MapToolsControl(props: MapToolsControlProps) {
  const { locale, t } = useI18n()
  const [expanded, setExpanded] = useState(false)
  const activeInternal = props.canUseInternalTools && props.internalMode !== 'navigation'
  const toggleMode = (mode: Exclude<InternalMapToolMode, 'navigation' | 'geolocation'>) => props.onModeChange(props.internalMode === mode ? 'navigation' : mode)
  const externalMode = props.mode === 'place-creation' || props.mode === 'trip-planning' || props.mode === 'point-selection' ? props.mode : null

  return <>
    <div className={`map-overlay-control-slot map-overlay-control-slot--tools${expanded ? ' is-expanded' : ''}`}>
      <section className={`map-tools-control${expanded ? ' is-expanded' : ''}`} aria-label={t('map.tools.title')}>
        <button className={activeInternal ? 'active' : ''} type="button" aria-expanded={expanded} aria-label={t('map.tools.title')} title={t('map.tools.title')} onClick={() => setExpanded((current) => !current)}>
          <MapIcon size={18} aria-hidden="true" />
        </button>
        {expanded && <div className="map-tools-control__menu">
          <div className="map-tools-control__heading"><strong>{t('map.tools.title')}</strong><button type="button" aria-label={t('map.tools.reset')} title={t('map.tools.reset')} onClick={props.onReset}><RotateCcw size={16} aria-hidden="true" /></button></div>
          <div className="map-tools-control__grid" aria-label={t('map.tools.interactions')}>
            {(Object.keys(modeIcons) as Array<keyof typeof modeIcons>).map((mode) => {
              const Icon = modeIcons[mode]
              return <button key={mode} type="button" className={props.internalMode === mode ? 'active' : ''} aria-pressed={props.internalMode === mode} disabled={!props.canUseInternalTools} onClick={() => toggleMode(mode)}><Icon size={17} aria-hidden="true" /><span>{t(`map.tools.mode.${mode}`)}</span></button>
            })}
            <button type="button" className={props.internalMode === 'geolocation' ? 'active' : ''} aria-pressed={props.internalMode === 'geolocation'} disabled={!props.canUseInternalTools || props.geolocationLoading} onClick={props.onRequestGeolocation}><LocateFixed size={17} aria-hidden="true" /><span>{props.geolocationLoading ? t('map.tools.geolocation.loading') : t('map.tools.mode.geolocation')}</span></button>
          </div>

          <div className="map-tools-control__section">
            <span>{t('map.tools.fit')}</span>
            <div className="map-tools-control__fit-actions">
              <button type="button" disabled={!props.hasVisiblePlaces} onClick={props.onFitVisible}>{t('map.tools.fit.visible')}</button>
              <button type="button" disabled={!props.hasSelectedPlaces} onClick={props.onFitSelection}>{t('map.tools.fit.selection')}</button>
              <button type="button" disabled={!props.hasTrip} onClick={props.onFitTrip}>{t('map.tools.fit.trip')}</button>
              <button type="button" disabled={!props.hasActiveDay} onClick={props.onFitDay}>{t('map.tools.fit.day')}</button>
            </div>
          </div>

          <button type="button" className="map-tools-control__wide-action" onClick={props.onToggleFullscreen}>{props.fullscreen ? <Minimize2 size={17} aria-hidden="true" /> : <Maximize2 size={17} aria-hidden="true" />}<span>{props.fullscreen ? t('map.tools.fullscreen.exit') : t('map.tools.fullscreen.enter')}</span></button>

          {props.internalMode === 'measurement' && <div className="map-tools-control__active-panel">
            <span>{t('map.measure.total')}</span><strong>{formatMeasurementDistance(measurementTotal(props.measurementPoints), locale)}</strong><small>{t('map.measure.points', { count: props.measurementPoints.length })}</small>
            <button type="button" disabled={props.measurementPoints.length === 0} onClick={props.onUndoMeasurement}><Undo2 size={16} aria-hidden="true" />{t('map.measure.undo')}</button>
          </div>}
          {props.internalMode === 'area-selection' && <div className="map-tools-control__active-panel">
            <span>{props.extent?.locked ? t('map.tools.selection.previewReady') : t('map.tools.extent.help')}</span>
            {props.extent?.locked && <>
              <small>{t('map.tools.selection.candidates', { count: props.areaCandidateCount })}</small>
              <div className="map-tools-control__strategy">
                <button type="button" className={props.selectionStrategy === 'replace' ? 'active' : ''} onClick={() => props.onSelectionStrategyChange('replace')}>{t('map.tools.selection.replace')}</button>
                <button type="button" className={props.selectionStrategy === 'add' ? 'active' : ''} onClick={() => props.onSelectionStrategyChange('add')}>{t('map.tools.selection.add')}</button>
              </div>
              <button type="button" onClick={props.onApplyAreaSelection}><MousePointer2 size={16} aria-hidden="true" />{t('map.tools.selection.apply')}</button>
            </>}
          </div>}
          {props.internalMode === 'extent-drawing' && <div className="map-tools-control__active-panel map-tools-control__extent-panel">
            <span>{props.extent?.locked ? t('map.tools.extent.geometryReady') : t('map.tools.extent.geometryHelp')}</span>
            {props.extent && (() => {
              const dimensions = mapExtentDimensions(props.extent)
              return <div className="map-tools-control__extent-metrics">
                <article><small>{t('map.tools.extent.area')}</small><strong>{formatMapArea(mapExtentArea(props.extent), locale)}</strong></article>
                <article><small>{t('map.tools.extent.dimensions')}</small><strong>{formatMeasurementDistance(dimensions.width, locale)} × {formatMeasurementDistance(dimensions.height, locale)}</strong></article>
                <article><small>{t('map.tools.extent.perimeter')}</small><strong>{formatMeasurementDistance(dimensions.perimeter, locale)}</strong></article>
              </div>
            })()}
            {props.extent?.locked && <div className="map-tools-control__extent-actions">
              <button type="button" onClick={props.onCopyExtent}><Copy size={15} aria-hidden="true" />{t('map.tools.extent.copy')}</button>
              <button type="button" onClick={props.onApplyAreaSelection}><MousePointer2 size={15} aria-hidden="true" />{t('map.tools.extent.useSelection')}</button>
            </div>}
          </div>}
          {props.internalMode === 'coordinates' && <div className="map-tools-control__active-panel">
            <span>{t('map.tools.coordinates.help')}</span>
            {props.coordinate && <><strong>{props.coordinate.latitude.toFixed(6)}, {props.coordinate.longitude.toFixed(6)}</strong><div className="map-tools-control__strategy"><button type="button" onClick={props.onCopyCoordinates}><Copy size={15} aria-hidden="true" />{t('map.tools.coordinates.copy')}</button>{props.canCreate && <button type="button" onClick={props.onCreateAtCoordinate}><MousePointer2 size={15} aria-hidden="true" />{t('map.tools.coordinates.create')}</button>}</div></>}
          </div>}
          {props.internalMode === 'geolocation' && <div className="map-tools-control__active-panel"><span>{t('map.tools.geolocation.once')}</span></div>}
          {externalMode && <p className="map-tools-control__mode-notice">{t(`map.tools.external.${externalMode}`)}</p>}
          {props.notice && <p className="map-tools-control__notice" role="status">{props.notice}</p>}
          {props.selectedCount > 0 && <small className="map-tools-control__selection-count">{t('map.tools.selection.current', { count: props.selectedCount })}</small>}
        </div>}
      </section>
    </div>
  </>
}
