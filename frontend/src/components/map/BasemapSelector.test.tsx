import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { BasemapSelector } from './BasemapSelector'

afterEach(cleanup)

describe('BasemapSelector', () => {
  it('shows only the active basemap until the control is hovered', () => {
    render(<BasemapSelector activeBasemapId="cartavault-light" onBasemapChange={vi.fn()} />)
    const selector = screen.getByRole('group', { name: 'Fond cartographique' })
    const active = screen.getByRole('button', { name: 'Utiliser le fond CartaVault Light' })
    expect(active).toHaveAttribute('aria-pressed', 'true')
    expect(active).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('button', { name: 'Utiliser le fond CartaVault Dark' })).not.toBeInTheDocument()

    fireEvent.mouseEnter(selector)
    expect(screen.getByRole('button', { name: 'Utiliser le fond CartaVault Dark' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Utiliser le fond Satellite' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Utiliser le fond OpenStreetMap Standard' })).toBeVisible()

    fireEvent.mouseLeave(selector)
    expect(screen.queryByRole('button', { name: 'Utiliser le fond Satellite' })).not.toBeInTheDocument()
  })

  it('changes the basemap and collapses after click', () => {
    const onBasemapChange = vi.fn()
    render(<BasemapSelector activeBasemapId="osm" onBasemapChange={onBasemapChange} />)
    fireEvent.mouseEnter(screen.getByRole('group', { name: 'Fond cartographique' }))
    const dark = screen.getByRole('button', { name: 'Utiliser le fond CartaVault Dark' })
    fireEvent.click(dark)
    expect(onBasemapChange).toHaveBeenCalledWith('cartavault-dark')
    expect(onBasemapChange).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('button', { name: 'Utiliser le fond CartaVault Dark' })).not.toBeInTheDocument()
  })

  it('expands on keyboard focus and supports keyboard selection', () => {
    const onBasemapChange = vi.fn()
    render(<BasemapSelector activeBasemapId="osm" onBasemapChange={onBasemapChange} />)
    fireEvent.focus(screen.getByRole('button', { name: 'Utiliser le fond OpenStreetMap Standard' }))
    const satellite = screen.getByRole('button', { name: 'Utiliser le fond Satellite' })
    fireEvent.keyDown(satellite, { key: 'Enter' })
    expect(onBasemapChange).toHaveBeenCalledWith('satellite')
  })
})
