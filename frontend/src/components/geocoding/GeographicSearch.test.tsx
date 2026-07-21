import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { GeographicSearch } from './GeographicSearch'

afterEach(cleanup)

describe('GeographicSearch', () => {
  it('starts compact and stays expanded while a query is entered', () => {
    const { container } = render(<GeographicSearch focus={[48, 2]} selected={null} onSelect={vi.fn()} onClear={vi.fn()} onCreate={vi.fn()} />)
    const search = container.querySelector('.geographic-search')
    const input = screen.getByRole('searchbox', { name: 'Rechercher une adresse ou des coordonnées' })

    expect(search).not.toHaveClass('is-pinned-open')
    expect(screen.getByRole('button', { name: 'Lancer la recherche géographique' }).querySelector('svg')).toBeInTheDocument()

    fireEvent.change(input, { target: { value: 'Nancy' } })
    expect(search).toHaveClass('is-pinned-open')

    fireEvent.change(input, { target: { value: '' } })
    expect(search).not.toHaveClass('is-pinned-open')
  })
})
