import { useRef } from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createMemoryRouter, RouterProvider, useLocation, useNavigate } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { UnsavedNavigationBlocker } from './UnsavedNavigationBlocker'

afterEach(cleanup)

function Harness({ dirty, requestLeave }: { dirty: boolean; requestLeave: () => Promise<boolean> }) {
  const navigate = useNavigate()
  const location = useLocation()
  const skipNextNavigationRef = useRef(false)
  return <>
    <UnsavedNavigationBlocker dirty={dirty} requestLeave={requestLeave} skipNextNavigationRef={skipNextNavigationRef} />
    <output data-testid="path">{location.pathname}</output>
    <button type="button" onClick={() => navigate('/second')}>Suivant</button>
    <button type="button" onClick={() => navigate(-1)}>Précédent</button>
  </>
}

function renderHarness(initialEntries: string[], initialIndex: number, requestLeave: () => Promise<boolean>) {
  const router = createMemoryRouter([{ path: '*', element: <Harness dirty requestLeave={requestLeave} /> }], { initialEntries, initialIndex })
  render(<RouterProvider router={router} />)
  return router
}

describe('UnsavedNavigationBlocker', () => {
  it('keeps the current route when a PUSH navigation is cancelled', async () => {
    const requestLeave = vi.fn(() => Promise.resolve(false))
    renderHarness(['/first'], 0, requestLeave)

    fireEvent.click(screen.getByRole('button', { name: 'Suivant' }))

    await waitFor(() => expect(requestLeave).toHaveBeenCalledTimes(1))
    expect(screen.getByTestId('path')).toHaveTextContent('/first')
  })

  it('continues the exact pending navigation after confirmation', async () => {
    const requestLeave = vi.fn(() => Promise.resolve(true))
    renderHarness(['/first'], 0, requestLeave)

    fireEvent.click(screen.getByRole('button', { name: 'Suivant' }))

    await waitFor(() => expect(screen.getByTestId('path')).toHaveTextContent('/second'))
    expect(requestLeave).toHaveBeenCalledTimes(1)
  })

  it('protects browser POP navigation and leaves history coherent after cancellation', async () => {
    const requestLeave = vi.fn()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true)
    renderHarness(['/first', '/second'], 1, requestLeave)

    fireEvent.click(screen.getByRole('button', { name: 'Précédent' }))
    await waitFor(() => expect(requestLeave).toHaveBeenCalledTimes(1))
    expect(screen.getByTestId('path')).toHaveTextContent('/second')

    fireEvent.click(screen.getByRole('button', { name: 'Précédent' }))
    await waitFor(() => expect(screen.getByTestId('path')).toHaveTextContent('/first'))
    expect(requestLeave).toHaveBeenCalledTimes(2)
  })
})
