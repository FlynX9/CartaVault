import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MapContextMenu } from './MapContextMenu'
import { buildGoogleMapsUrl, formatContextCoordinates } from './mapContextMenuUtils'

describe('MapContextMenu', () => {
  it('formats stable coordinates and Google Maps URLs', () => {
    expect(formatContextCoordinates(-48.1, 2.2)).toBe('-48.100000, 2.200000')
    expect(buildGoogleMapsUrl(48.8566, 2.3522)).toBe('https://www.google.com/maps/search/?api=1&query=48.8566%2C2.3522')
  })
  it('renders safe actions at the Leaflet container position', () => {
    render(<MapContextMenu state={{ latitude: 48, longitude: 2, containerX: 10, containerY: 20 }} onClose={vi.fn()} onCreate={vi.fn()} onCopy={vi.fn()} />)
    expect(screen.getByRole('menu')).toBeVisible()
    expect(screen.getByRole('menuitem', { name: 'Ouvrir dans Google Maps' })).toHaveAttribute('rel', 'noopener noreferrer')
    expect(screen.queryByRole('menuitem', { name: 'Fermer' })).not.toBeInTheDocument()
  })

  it('adds the clicked coordinates to a selected trip day through a submenu', () => {
    const add = vi.fn()
    render(<MapContextMenu state={{ latitude: 48, longitude: 2, containerX: 10, containerY: 20 }} tripDays={[{ id: 'day-1', label: 'Jour 1 · Bruxelles' }, { id: 'day-2', label: 'Jour 2' }]} onAddToTripDay={add} onClose={vi.fn()} onCreate={vi.fn()} onCopy={vi.fn()} />)
    fireEvent.click(screen.getByRole('menuitem', { name: 'Ajouter au jour…' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Jour 1 · Bruxelles' }))
    expect(add).toHaveBeenCalledWith('day-1')
  })
})
