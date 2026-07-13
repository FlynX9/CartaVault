import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { CountrySelector } from './CountrySelector'

afterEach(cleanup)

describe('CountrySelector', () => {
  it('shows available countries and reports a selection', () => {
    const onChange = vi.fn()
    render(
      <CountrySelector
        countries={['France', 'Belgique']}
        activeCountry={null}
        isLoading={false}
        errorMessage={null}
        onChange={onChange}
      />,
    )

    const selector = screen.getByRole('combobox', { name: 'Pays' })
    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual([
      'Tous les pays',
      'Belgique',
      'France',
    ])
    fireEvent.change(selector, { target: { value: 'France' } })
    expect(onChange).toHaveBeenCalledWith('France')
  })
})
