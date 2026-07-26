interface HorizontalViewport {
  popupLeft: number
  popupRight: number
  availableLeft: number
  availableRight: number
}

interface VerticalViewport {
  popupTop: number
  popupBottom: number
  availableTop: number
  availableBottom: number
}

export function calculateHorizontalPopupPan({
  popupLeft,
  popupRight,
  availableLeft,
  availableRight,
}: HorizontalViewport): number {
  const popupWidth = popupRight - popupLeft
  const availableWidth = availableRight - availableLeft

  if (popupWidth > availableWidth) {
    return ((popupLeft + popupRight) / 2) - ((availableLeft + availableRight) / 2)
  }
  if (popupLeft < availableLeft) return popupLeft - availableLeft
  if (popupRight > availableRight) return popupRight - availableRight
  return 0
}

export function calculateVerticalPopupPan({
  popupTop,
  popupBottom,
  availableTop,
  availableBottom,
}: VerticalViewport): number {
  const popupHeight = popupBottom - popupTop
  const availableHeight = availableBottom - availableTop

  if (popupHeight > availableHeight) {
    return ((popupTop + popupBottom) / 2) - ((availableTop + availableBottom) / 2)
  }
  if (popupTop < availableTop) return popupTop - availableTop
  if (popupBottom > availableBottom) return popupBottom - availableBottom
  return 0
}
