import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { StatusLegend } from './StatusLegend'

afterEach(cleanup)

describe('StatusLegend', () => {
  const statuses = [
    { id: 'todo', map_id: 'map-id', name: 'À faire', slug: 'a-faire', color: '#2563EB', is_active: true, functional_state: 'non_visited' as const },
    { id: 'done', map_id: 'map-id', name: 'Fait', slug: 'fait', color: '#16A34A', is_active: true, functional_state: 'visited' as const },
  ]

  it('collapses to a compact legend control and expands again', () => {
    render(<StatusLegend statuses={statuses} />)

    expect(screen.getByLabelText('Légende des statuts')).toHaveTextContent('À faire')
    fireEvent.click(screen.getByRole('button', { name: 'Réduire la légende des statuts' }))

    expect(screen.getByLabelText('Légende des statuts')).toHaveClass('status-legend--collapsed')
    expect(screen.queryByText('À faire')).not.toBeInTheDocument()
    expect(screen.getByText('Légende')).toBeVisible()

    fireEvent.click(screen.getByRole('button', { name: 'Afficher la légende des statuts' }))
    expect(screen.getByText('À faire')).toBeVisible()
    expect(screen.getByText('Fait')).toBeVisible()
  })
})
