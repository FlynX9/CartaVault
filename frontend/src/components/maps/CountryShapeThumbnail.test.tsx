import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { CountryShapeThumbnail } from './CountryShapeThumbnail'

afterEach(cleanup)

describe('CountryShapeThumbnail', () => {
  it.each([
    ['FRA', 'mainland'],
    ['ITA', 'multi-landmass'],
    ['BEL', 'mainland'],
    ['GEO', 'mainland'],
    ['ALA', 'archipelago'],
  ])('renders %s as a static decorative SVG in %s mode', (countryCode, mode) => {
    const { container } = render(<CountryShapeThumbnail countryCode={countryCode} />)
    const svg = container.querySelector('svg')
    expect(svg).toHaveAttribute('viewBox', '0 0 400 300')
    expect(svg).toHaveAttribute('preserveAspectRatio', 'xMidYMid meet')
    expect(svg).toHaveAttribute('aria-hidden', 'true')
    expect(svg).toHaveAttribute('data-shape-mode', mode)
    expect(container.querySelector('.maps-catalog__country-shape-path')).toHaveAttribute('vector-effect', 'non-scaling-stroke')
    expect(container.querySelectorAll('.maps-catalog__country-topography path')).toHaveLength(6)
    expect(container.querySelector('image')).not.toBeInTheDocument()
    expect(container).not.toHaveTextContent('OpenStreetMap')
  })
})
