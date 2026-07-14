import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { BasemapSelector } from './BasemapSelector'

afterEach(cleanup)

describe('BasemapSelector', () => {
  it('shows all four accessible choices and marks the active one', () => {
    render(<BasemapSelector activeBasemapId="cartavault-light" onBasemapChange={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Utiliser le fond CartaVault Light' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Utiliser le fond CartaVault Dark' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Utiliser le fond Satellite' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Utiliser le fond OpenStreetMap Standard' })).toBeVisible()
  })

  it('changes the basemap with click or keyboard', () => {
    const onBasemapChange = vi.fn()
    render(<BasemapSelector activeBasemapId="osm" onBasemapChange={onBasemapChange} />)
    const dark = screen.getByRole('button', { name: 'Utiliser le fond CartaVault Dark' })
    fireEvent.click(dark)
    fireEvent.keyDown(dark, { key: 'Enter' })
    expect(onBasemapChange).toHaveBeenCalledWith('cartavault-dark')
    expect(onBasemapChange).toHaveBeenCalledTimes(2)
  })
})
