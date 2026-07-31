import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { TripPdfExportDialog } from './TripPdfExportDialog'

describe('TripPdfExportDialog', () => {
  afterEach(cleanup)

  it('starts with all content enabled and Google Maps selected', () => {
    render(<TripPdfExportDialog trigger={null} onClose={vi.fn()} onExport={vi.fn()} />)

    expect(screen.getByRole('checkbox', { name: /Inclure la carte générale/ })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: /Inclure les photos des lieux/ })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: /Inclure les QR codes/ })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: /Google Maps/ })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: /Waze/ })).not.toBeChecked()
  })

  it('submits modified options and keeps the dialog open while generating', async () => {
    let resolveExport!: () => void
    const onExport = vi.fn(() => new Promise<void>((resolve) => { resolveExport = resolve }))
    const onClose = vi.fn()
    render(<TripPdfExportDialog trigger={null} onClose={onClose} onExport={onExport} />)

    fireEvent.click(screen.getByRole('checkbox', { name: /Inclure la carte générale/ }))
    fireEvent.click(screen.getByRole('checkbox', { name: /Inclure les photos des lieux/ }))
    fireEvent.click(screen.getByRole('checkbox', { name: /Google Maps/ }))
    fireEvent.click(screen.getByRole('checkbox', { name: /Waze/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Exporter le PDF' }))

    expect(onExport).toHaveBeenCalledWith({
      include_overview_map: false,
      include_place_images: false,
      include_navigation_qr_codes: true,
      navigation_providers: ['waze'],
    })
    expect(screen.getByRole('button', { name: 'Génération…' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Annuler' })).toBeDisabled()
    expect(onClose).not.toHaveBeenCalled()

    resolveExport()
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce())
  })

  it('hides provider choices when QR codes are disabled', () => {
    render(<TripPdfExportDialog trigger={null} onClose={vi.fn()} onExport={vi.fn()} />)
    fireEvent.click(screen.getByRole('checkbox', { name: /Inclure les QR codes/ }))
    expect(screen.queryByRole('checkbox', { name: /Google Maps/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: /Waze/ })).not.toBeInTheDocument()
  })

  it('supports Google Maps and Waze together and requires one provider', async () => {
    const onExport = vi.fn().mockResolvedValue(undefined)
    render(<TripPdfExportDialog trigger={null} onClose={vi.fn()} onExport={onExport} />)

    fireEvent.click(screen.getByRole('checkbox', { name: /Waze/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Exporter le PDF' }))
    await waitFor(() => expect(onExport).toHaveBeenCalledWith(expect.objectContaining({ navigation_providers: ['google_maps', 'waze'] })))

    cleanup()
    render(<TripPdfExportDialog trigger={null} onClose={vi.fn()} onExport={vi.fn()} />)
    fireEvent.click(screen.getByRole('checkbox', { name: /Google Maps/ }))
    expect(screen.getByRole('button', { name: 'Exporter le PDF' })).toBeDisabled()
    expect(screen.getByText('Sélectionnez au moins une application de navigation.')).toBeVisible()
  })

  it('cancels without starting an export', () => {
    const onClose = vi.fn()
    const onExport = vi.fn()
    render(<TripPdfExportDialog trigger={null} onClose={onClose} onExport={onExport} />)

    fireEvent.click(screen.getByRole('button', { name: 'Annuler' }))

    expect(onClose).toHaveBeenCalledOnce()
    expect(onExport).not.toHaveBeenCalled()
  })

  it('keeps the dialog open when the generated file cannot be downloaded', async () => {
    const onClose = vi.fn()
    render(<TripPdfExportDialog trigger={null} onClose={onClose} onExport={vi.fn().mockRejectedValue(new Error('Téléchargement impossible.'))} />)

    fireEvent.click(screen.getByRole('button', { name: 'Exporter le PDF' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Téléchargement impossible.')
    expect(screen.getByRole('dialog', { name: 'Options d’export' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Exporter le PDF' })).toBeEnabled()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('keeps keyboard focus inside the dialog', async () => {
    render(<TripPdfExportDialog trigger={null} onClose={vi.fn()} onExport={vi.fn()} />)
    const close = screen.getByRole('button', { name: 'Fermer les options d’export' })
    const exportButton = screen.getByRole('button', { name: 'Exporter le PDF' })
    await waitFor(() => expect(close).toHaveFocus())

    exportButton.focus()
    fireEvent.keyDown(document, { key: 'Tab' })
    expect(close).toHaveFocus()

    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true })
    expect(exportButton).toHaveFocus()
  })

  it('closes on Escape and restores focus to its trigger', async () => {
    const trigger = document.createElement('button')
    document.body.append(trigger)
    trigger.focus()
    const onClose = vi.fn()
    const rendered = render(<TripPdfExportDialog trigger={trigger} onClose={onClose} onExport={vi.fn()} />)

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledOnce()
    rendered.unmount()
    expect(trigger).toHaveFocus()
    trigger.remove()
  })
})
