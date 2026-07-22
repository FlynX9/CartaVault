import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

import { RequireAdmin } from './RequireAdmin'

let auth = { loading: false, user: { is_admin: true } as { is_admin: boolean } | null }
vi.mock('./useAuth', () => ({ useAuth: () => auth }))

afterEach(() => { cleanup(); auth = { loading: false, user: { is_admin: true } } })

describe('RequireAdmin', () => {
  it('renders the protected console for an administrator', () => {
    render(<MemoryRouter><RequireAdmin><p>Console privée</p></RequireAdmin></MemoryRouter>)
    expect(screen.getByText('Console privée')).toBeVisible()
  })

  it('redirects a standard user to the workspace', () => {
    auth = { loading: false, user: { is_admin: false } }
    render(<MemoryRouter initialEntries={['/admin/users']}><Routes><Route path="/admin/users" element={<RequireAdmin><p>Console privée</p></RequireAdmin>} /><Route path="/" element={<p>Carte</p>} /></Routes></MemoryRouter>)
    expect(screen.getByText('Carte')).toBeVisible()
    expect(screen.queryByText('Console privée')).not.toBeInTheDocument()
  })
})
