import { beforeEach, describe, expect, it, vi } from 'vitest'

import { clearActionHistory, recordReversibleAction, redoLastAction, undoLastAction } from './actionHistory'

describe('action history', () => {
  beforeEach(() => clearActionHistory())

  it('undoes and redoes the latest successful action', async () => {
    const undo = vi.fn().mockResolvedValue(undefined)
    const redo = vi.fn().mockResolvedValue(undefined)
    recordReversibleAction({ label: 'ajout', undo, redo })

    expect(await undoLastAction()).toBe(true)
    expect(undo).toHaveBeenCalledOnce()
    expect(await redoLastAction()).toBe(true)
    expect(redo).toHaveBeenCalledOnce()
  })

  it('keeps a failed action available for another undo attempt', async () => {
    const undo = vi.fn().mockRejectedValueOnce(new Error('indisponible')).mockResolvedValueOnce(undefined)
    recordReversibleAction({ label: 'suppression', undo, redo: vi.fn() })

    expect(await undoLastAction()).toBe(false)
    expect(await undoLastAction()).toBe(true)
    expect(undo).toHaveBeenCalledTimes(2)
  })

  it('clears redo actions when a new action is recorded', async () => {
    const firstRedo = vi.fn()
    recordReversibleAction({ label: 'première', undo: vi.fn(), redo: firstRedo })
    await undoLastAction()
    recordReversibleAction({ label: 'seconde', undo: vi.fn(), redo: vi.fn() })

    expect(await redoLastAction()).toBe(false)
    expect(firstRedo).not.toHaveBeenCalled()
  })
})
