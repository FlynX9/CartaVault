import { fireEvent, render, screen } from '@testing-library/react'
import { useRef, useState } from 'react'
import { describe, expect, it } from 'vitest'

import { useModalFocus } from './useModalFocus'

function TestDialog() {
  const [open, setOpen] = useState(true)
  const trigger = useRef<HTMLButtonElement>(null)
  const dialog = useRef<HTMLElement>(null)
  const first = useRef<HTMLButtonElement>(null)
  useModalFocus({ dialogRef: dialog, initialFocusRef: first, triggerRef: trigger, onEscape: () => setOpen(false) })
  return <><button ref={trigger}>Ouvrir</button>{open && <section ref={dialog} role="dialog"><button ref={first}>Premier</button><button>Dernier</button></section>}</>
}

describe('useModalFocus', () => {
  it('places focus in the dialog, traps Tab and restores focus to the trigger', async () => {
    render(<TestDialog />)
    await new Promise((resolve) => window.requestAnimationFrame(resolve))
    expect(screen.getByRole('button', { name: 'Premier' })).toHaveFocus()
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true })
    expect(screen.getByRole('button', { name: 'Dernier' })).toHaveFocus()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ouvrir' })).toHaveFocus()
  })
})
