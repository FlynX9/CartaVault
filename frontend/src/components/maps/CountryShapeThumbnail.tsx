import { Map as MapIcon } from 'lucide-react'
import { useId, useMemo } from 'react'

import { normalizeCountryShape } from './countryShapeGeometry'

const TOPOGRAPHIC_LINES = [
  'M-32 55 C50 3 131 18 179 66 S308 127 438 34',
  'M-45 88 C50 35 126 46 184 89 S315 154 449 64',
  'M-52 126 C44 69 132 76 197 118 S324 188 457 102',
  'M-59 169 C35 109 137 113 207 158 S334 225 466 145',
  'M-65 218 C31 153 141 154 216 201 S344 262 474 194',
  'M-70 267 C25 202 137 199 225 245 S352 303 480 244',
]

export function CountryShapeThumbnail({ countryCode }: { countryCode: string }) {
  const gradientId = `country-shape-gradient-${useId().replace(/:/g, '')}`
  const shape = useMemo(() => normalizeCountryShape(countryCode), [countryCode])
  if (!shape) return <MapIcon className="maps-catalog__preview-fallback" size={36} aria-hidden="true" />

  return (
    <svg
      className="maps-catalog__country-shape"
      viewBox={shape.viewBox}
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
      focusable="false"
      data-country-code={countryCode.toUpperCase()}
      data-shape-mode={shape.mode}
      data-shape-parts={shape.partCount}
    >
      <defs>
        <linearGradient id={gradientId} x1="8%" y1="4%" x2="92%" y2="96%">
          <stop offset="0%" className="maps-catalog__country-fill-start" />
          <stop offset="52%" className="maps-catalog__country-fill-middle" />
          <stop offset="100%" className="maps-catalog__country-fill-end" />
        </linearGradient>
      </defs>
      <g className="maps-catalog__country-topography" aria-hidden="true">
        {TOPOGRAPHIC_LINES.map((path) => <path d={path} key={path} />)}
      </g>
      <path
        className="maps-catalog__country-shape-path"
        d={shape.path}
        fill={`url(#${gradientId})`}
        fillRule="evenodd"
        clipRule="evenodd"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}
