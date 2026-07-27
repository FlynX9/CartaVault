import { Info } from 'lucide-react'
import { useId, useState, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

interface FieldHelpProps {
  children: ReactNode
  label?: string
}

interface TooltipPosition {
  left: number
  top: number
  placement: 'above' | 'below'
}

const VIEWPORT_GUTTER = 10
const TOOLTIP_MAX_WIDTH = 272

export function FieldHelp({ children, label = 'Afficher l’aide du champ' }: FieldHelpProps) {
  const tooltipId = useId()
  const [position, setPosition] = useState<TooltipPosition | null>(null)

  const open = (target: HTMLElement) => {
    const rect = target.getBoundingClientRect()
    const maxWidth = Math.min(TOOLTIP_MAX_WIDTH, window.innerWidth - VIEWPORT_GUTTER * 2)
    const left = Math.max(VIEWPORT_GUTTER + maxWidth / 2, Math.min(rect.left + rect.width / 2, window.innerWidth - VIEWPORT_GUTTER - maxWidth / 2))
    const placement = rect.top >= 88 ? 'above' : 'below'
    setPosition({ left, top: placement === 'above' ? rect.top - 7 : rect.bottom + 7, placement })
  }

  const tooltip = position && createPortal(
    <span
      id={tooltipId}
      className={`field-help__tooltip field-help__tooltip--${position.placement}`}
      role="tooltip"
      style={{ '--field-help-left': `${position.left}px`, '--field-help-top': `${position.top}px` } as CSSProperties}
    >
      {children}
    </span>,
    document.body,
  )

  return <span className="field-help" onMouseEnter={(event) => open(event.currentTarget)} onMouseLeave={() => setPosition(null)}>
    <span
      role="button"
      tabIndex={0}
      aria-label={label}
      aria-describedby={position ? tooltipId : undefined}
      onClick={(event) => open(event.currentTarget)}
      onFocus={(event) => open(event.currentTarget)}
      onBlur={() => setPosition(null)}
      onKeyDown={(event) => {
        if (event.key === 'Escape') setPosition(null)
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          open(event.currentTarget)
        }
      }}
    >
      <Info aria-hidden="true" size={13} />
    </span>
    {tooltip}
  </span>
}
