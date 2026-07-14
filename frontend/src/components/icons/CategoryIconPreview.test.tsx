import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { CategoryIconPreview } from './CategoryIconPreview'

describe('CategoryIconPreview', () => {
  it.each([
    ['mdi:church', 'Église'],
    ['mdi:factory', 'Usine'],
    ['material-symbols:location-on-outline', 'Emplacement'],
  ])('renders %s from local Iconify data', (iconId, label) => {
    const { container } = render(<CategoryIconPreview iconId={iconId} ariaLabel={label} />)

    expect(screen.getByRole('img', { name: label })).toBeVisible()
    expect(container.querySelector('svg path')).toBeInTheDocument()
  })

  it('renders the accessible local fallback for an unknown identifier', () => {
    render(<CategoryIconPreview iconId="legacy-icon" ariaLabel="Icône de secours" />)

    expect(screen.getByRole('img', { name: 'Icône de secours' })).toHaveTextContent('Aide (icône inconnue)')
  })
})
