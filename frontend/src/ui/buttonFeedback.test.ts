import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { installButtonFeedback } from './buttonFeedback'

describe('global button feedback', () => {
  let uninstall: () => void

  beforeEach(() => {
    vi.useFakeTimers()
    uninstall = installButtonFeedback()
  })

  afterEach(() => {
    uninstall()
    document.body.replaceChildren()
    vi.useRealTimers()
  })

  it('adds and removes the click feedback on regular buttons', () => {
    const button = document.createElement('button')
    button.textContent = 'Enregistrer'
    document.body.append(button)

    button.click()

    expect(button).toHaveClass('cv-button-click-feedback')
    vi.advanceTimersByTime(360)
    expect(button).not.toHaveClass('cv-button-click-feedback')
  })

  it('restarts the feedback when a button is clicked repeatedly', () => {
    const button = document.createElement('button')
    document.body.append(button)

    button.click()
    vi.advanceTimersByTime(200)
    button.click()
    vi.advanceTimersByTime(200)

    expect(button).toHaveClass('cv-button-click-feedback')
    vi.advanceTimersByTime(160)
    expect(button).not.toHaveClass('cv-button-click-feedback')
  })

  it('ignores disabled and filter buttons', () => {
    const disabled = document.createElement('button')
    disabled.disabled = true
    const filters = document.createElement('div')
    filters.className = 'places-quick-filters'
    const filterButton = document.createElement('button')
    filters.append(filterButton)
    const labelledFilter = document.createElement('button')
    labelledFilter.ariaLabel = 'Réinitialiser tous les filtres'
    document.body.append(disabled, filters, labelledFilter)

    disabled.click()
    filterButton.click()
    labelledFilter.click()

    expect(disabled).not.toHaveClass('cv-button-click-feedback')
    expect(filterButton).not.toHaveClass('cv-button-click-feedback')
    expect(labelledFilter).not.toHaveClass('cv-button-click-feedback')
  })
})
