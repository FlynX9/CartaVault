import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { StatusLegend } from './StatusLegend'

afterEach(cleanup)

describe('StatusLegend', () => {
  const statuses = [
    { id: 'todo', map_id: 'map-id', name: 'À faire', slug: 'a-faire', color: '#2563EB', is_active: true, functional_state: 'non_visited' as const },
    { id: 'done', map_id: 'map-id', name: 'Fait', slug: 'fait', color: '#16A34A', is_active: true, functional_state: 'visited' as const },
  ]

  it('stays compact by default and expands on hover or keyboard focus', () => {
    render(<StatusLegend statuses={statuses} />)

    const legend = screen.getByLabelText('Légende des statuts')
    expect(legend).toHaveClass('status-legend--collapsed')
    expect(screen.getByRole('list', { hidden: true })).toHaveAttribute('aria-hidden', 'true')

    fireEvent.mouseEnter(legend)
    expect(legend).toHaveClass('status-legend--expanded')
    expect(screen.getByRole('list')).toHaveAttribute('aria-hidden', 'false')
    expect(legend).toHaveTextContent('À faire')
    expect(legend).toHaveTextContent('Fait')

    fireEvent.mouseLeave(legend)
    expect(legend).toHaveClass('status-legend--collapsed')
    fireEvent.focus(screen.getByRole('button', { name: 'Afficher la légende des statuts' }))
    expect(legend).toHaveClass('status-legend--expanded')
  })
})
