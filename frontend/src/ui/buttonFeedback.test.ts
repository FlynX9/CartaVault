import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { installButtonFeedback } from './buttonFeedback'
import { announceApiMutationFailure, announceApiMutationStart, announceApiMutationSuccess } from '../api/mutationEvents'

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

  it('briefly replaces a successful action with a check', () => {
    const button = document.createElement('button')
    button.textContent = 'Optimiser'
    button.addEventListener('click', () => {
      const mutation = announceApiMutationStart('POST', '/trips/optimize')
      announceApiMutationSuccess(mutation)
    })
    document.body.append(button)

    button.click()
    vi.advanceTimersByTime(99)
    expect(button).not.toHaveClass('cv-button-action-success')
    vi.advanceTimersByTime(1)
    expect(button).toHaveClass('cv-button-action-success')
    vi.advanceTimersByTime(900)
    expect(button).not.toHaveClass('cv-button-action-success')
  })

  it('waits for every mutation and suppresses success after a failure', () => {
    const button = document.createElement('button')
    let first = null as ReturnType<typeof announceApiMutationStart> | null
    let second = null as ReturnType<typeof announceApiMutationStart> | null
    button.addEventListener('click', () => {
      first = announceApiMutationStart('POST', '/trips/day-1/route')
      second = announceApiMutationStart('POST', '/trips/day-2/route')
    })
    document.body.append(button)

    button.click()
    announceApiMutationSuccess(first!)
    vi.advanceTimersByTime(150)
    expect(button).not.toHaveClass('cv-button-action-success')
    announceApiMutationFailure(second!)
    vi.advanceTimersByTime(150)
    expect(button).not.toHaveClass('cv-button-action-success')
  })
})
