import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiError } from '../../api/client'
import { createTag, deleteTag, getTags, updateTag } from '../../api/tags'
import { TagsPage } from './TagsPage'

vi.mock('../../api/tags', () => ({
  getTags: vi.fn(),
  createTag: vi.fn(),
  updateTag: vi.fn(),
  deleteTag: vi.fn(),
}))

const TAG = { id: '22222222-2222-4222-8222-222222222222', name: 'Brique' }

beforeEach(() => {
  vi.mocked(getTags).mockResolvedValue([TAG])
  vi.mocked(createTag).mockResolvedValue(TAG)
  vi.mocked(updateTag).mockResolvedValue(TAG)
  vi.mocked(deleteTag).mockResolvedValue()
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

function openTagForm() {
  fireEvent.click(screen.getByRole('button', { name: 'Créer un tag' }))
  return screen.getByRole('textbox', { name: 'Nom *' })
}

describe('TagsPage', () => {
  it('uses the backend search parameter after a debounce', async () => {
    render(<TagsPage />)
    await screen.findByText('Brique')
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: ' bri ' } })
    await waitFor(() => expect(getTags).toHaveBeenLastCalledWith(expect.any(AbortSignal), 'bri'), { timeout: 1000 })
  })

  it('creates a tag', async () => {
    render(<TagsPage />)
    await screen.findByText('Brique')
    fireEvent.change(openTagForm(), { target: { value: '  Rouille ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
    await waitFor(() => expect(createTag).toHaveBeenCalledWith({ name: 'Rouille' }))
  })

  it('shows a clear duplicate-name conflict', async () => {
    vi.mocked(createTag).mockRejectedValue(new ApiError(409, 'A tag with this name already exists'))
    render(<TagsPage />)
    await screen.findByText('Brique')
    fireEvent.change(openTagForm(), { target: { value: 'Brique' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Ce nom existe déjà pour un tag.')
  })

  it('modifies a tag', async () => {
    vi.mocked(updateTag).mockResolvedValue({ ...TAG, name: 'Pierre' })
    render(<TagsPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'Modifier Brique' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Nom *' }), { target: { value: 'Pierre' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
    await waitFor(() => expect(updateTag).toHaveBeenCalledWith(TAG.id, { name: 'Pierre' }))
  })

  it('deletes a tag after explicit confirmation', async () => {
    render(<TagsPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'Supprimer Brique' }))
    fireEvent.click(screen.getByRole('button', { name: 'Supprimer définitivement' }))
    await waitFor(() => expect(deleteTag).toHaveBeenCalledWith(TAG.id))
  })

  it('renders API errors and an empty result', async () => {
    vi.mocked(getTags).mockRejectedValueOnce(new Error('API indisponible')).mockResolvedValueOnce([])
    const { unmount } = render(<TagsPage />)
    expect(await screen.findByRole('alert')).toHaveTextContent('API indisponible')
    unmount()
    render(<TagsPage />)
    expect(await screen.findByText('Aucun élément dans les tags.')).toBeVisible()
  })

  it('prevents a double submission', async () => {
    let resolveCreate: ((value: typeof TAG) => void) | undefined
    vi.mocked(createTag).mockImplementation(() => new Promise((resolve) => { resolveCreate = resolve }))
    render(<TagsPage />)
    await screen.findByText('Brique')
    fireEvent.change(openTagForm(), { target: { value: 'Unique' } })
    const submit = screen.getByRole('button', { name: 'Enregistrer' })
    fireEvent.click(submit)
    fireEvent.click(submit)
    expect(createTag).toHaveBeenCalledTimes(1)
    resolveCreate?.(TAG)
  })
})
