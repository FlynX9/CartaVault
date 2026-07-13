import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MapSelector } from './MapSelector'

describe('MapSelector', () => { it('contains only maps returned by the maps API', () => { render(<MapSelector maps={[{ id: 'a', name: 'France', country: { name: 'France' } } as never]} activeMapId="a" isLoading={false} errorMessage={null} onChange={vi.fn()} />); expect(screen.getByRole('option', { name: 'France — France' })).toBeVisible(); expect(screen.getAllByRole('option')).toHaveLength(2) }) })
