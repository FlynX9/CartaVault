import { fireEvent, render, screen } from '@testing-library/react'
import { Map } from 'lucide-react'
import { describe, expect, it, vi } from 'vitest'

import { EmptyState } from './EmptyState'

describe('EmptyState', () => {
  it('renders caller-provided content and optional actions accessibly', () => {
    const create = vi.fn()
    render(<EmptyState icon={<Map />} title="Aucune carte" description="Créez votre première carte." action={{ label: 'Créer', onClick: create }} secondaryAction={{ label: 'Importer', onClick: vi.fn() }} />)

    expect(screen.getByRole('heading', { name: 'Aucune carte' })).toBeVisible()
    expect(screen.getByText('Créez votre première carte.')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Créer' }))
    expect(create).toHaveBeenCalledOnce()
  })
})
