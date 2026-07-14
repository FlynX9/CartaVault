import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { CATEGORY_ICON_IDS } from './categoryIconCatalog'
import { CategoryIcon } from './categoryIcons'

describe('category icon catalog', () => {
  it('contains the safe default and renders a fallback for an unknown identifier', () => {
    expect(CATEGORY_ICON_IDS).toContain('map-pin')
    const { container } = render(<CategoryIcon icon="unknown-icon" />)
    expect(container.querySelector('svg')).toBeInTheDocument()
  })
})
