export function measureVirtualRowHeight(element: Element, fallback: number) {
  // CartaVault scales the complete application shell on desktop. Unlike
  // getBoundingClientRect(), offsetHeight stays in layout coordinates, which
  // are also the coordinates used by the virtual row translateY positions.
  return (element instanceof HTMLElement ? element.offsetHeight : 0) || fallback
}
