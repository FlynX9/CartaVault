import { useState } from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { CategoryIconField } from './CategoryIconField'

function renderField(iconId = 'mdi:church') {
  const onChange = vi.fn()
  function FieldHarness() {
    const [value, setValue] = useState(iconId)
    return <CategoryIconField value={value} onChange={(nextIconId) => { onChange(nextIconId); setValue(nextIconId) }} />
  }
  render(<FieldHarness />)
  return onChange
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('CategoryIconField', () => {
  it('shows the selected icon and keeps the picker closed initially', () => {
    renderField()

    expect(screen.getByText('Église')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Changer' })).toBeVisible()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('opens with focus in search and searches labels, keywords, accents, and multiple words', () => {
    renderField()
    fireEvent.click(screen.getByRole('button', { name: 'Changer' }))

    const search = screen.getByRole('searchbox', { name: 'Rechercher une icône' })
    expect(screen.getByRole('dialog').parentElement).toHaveClass('category-icon-modal-backdrop')
    expect(document.body.contains(screen.getByRole('dialog'))).toBe(true)
    expect(search).toHaveFocus()
    fireEvent.change(search, { target: { value: 'chapelle' } })
    expect(screen.getByRole('gridcell', { name: /^Église/ })).toBeVisible()
    fireEvent.change(search, { target: { value: 'hopital' } })
    expect(screen.getByRole('gridcell', { name: 'Hôpital' })).toBeVisible()
    fireEvent.change(search, { target: { value: 'depot ferroviaire' } })
    expect(screen.getByRole('gridcell', { name: 'Train' })).toBeVisible()
  })

  it('filters by group without clearing the active search', () => {
    renderField()
    fireEvent.click(screen.getByRole('button', { name: 'Changer' }))
    const search = screen.getByRole('searchbox', { name: 'Rechercher une icône' })
    fireEvent.change(search, { target: { value: 'église' } })
    fireEvent.click(screen.getByRole('button', { name: 'Religion' }))

    expect(search).toHaveValue('église')
    expect(screen.getByRole('gridcell', { name: /^Église/ })).toBeVisible()
  })

  it('selects an icon only after confirmation and supports keyboard grid navigation', async () => {
    const onChange = renderField()
    fireEvent.click(screen.getByRole('button', { name: 'Changer' }))
    const church = screen.getByRole('gridcell', { name: 'Église, sélectionnée' })
    church.focus()
    fireEvent.keyDown(church, { key: 'ArrowRight' })
    expect(screen.getByRole('gridcell', { name: 'Croix' })).toHaveFocus()

    fireEvent.click(screen.getByRole('gridcell', { name: 'Château' }))
    fireEvent.click(screen.getByRole('button', { name: 'Choisir' }))

    await waitFor(() => expect(onChange).toHaveBeenCalledWith('mdi:castle'))
    expect(screen.getByText('Château')).toBeVisible()
  })

  it('cancels or closes on Escape without changing the value and restores focus', async () => {
    const onChange = renderField()
    const changeButton = screen.getByRole('button', { name: 'Changer' })
    fireEvent.click(changeButton)
    fireEvent.click(screen.getByRole('gridcell', { name: 'Château' }))
    fireEvent.click(screen.getByRole('button', { name: 'Annuler' }))

    await waitFor(() => expect(changeButton).toHaveFocus())
    expect(onChange).not.toHaveBeenCalled()

    fireEvent.click(changeButton)
    fireEvent.keyDown(window, { key: 'Escape' })
    await waitFor(() => expect(changeButton).toHaveFocus())
    expect(onChange).not.toHaveBeenCalled()
  })

  it('uses the local fallback for an unknown value without fetching', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    renderField('legacy-icon')

    expect(screen.getByText('Aide (icône inconnue)')).toBeVisible()
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
