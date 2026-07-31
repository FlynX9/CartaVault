const INTERACTIVE_SELECTOR = [
  'button',
  'input:not([type="hidden"])',
  'select',
  'textarea',
  'a[href]',
  '[role="button"]',
  '[contenteditable="true"]',
].join(', ')

const AUTO_TITLE_ATTRIBUTE = 'data-cv-auto-title'

function normalizedText(value: string | null | undefined): string {
  return (value ?? '').replace(/\s+/g, ' ').trim()
}

function conciseTitle(value: string): string {
  const maxLength = 180
  return value.length > maxLength ? `${value.slice(0, maxLength - 1).trimEnd()}…` : value
}

function labelledByText(element: Element, root: Document): string {
  const ids = normalizedText(element.getAttribute('aria-labelledby')).split(' ').filter(Boolean)
  return normalizedText(ids.map((id) => root.getElementById(id)?.textContent).filter(Boolean).join(' '))
}

function associatedLabelText(element: Element): string {
  if (!(element instanceof HTMLInputElement || element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement)) return ''
  return normalizedText(Array.from(element.labels ?? []).map((label) => label.textContent).join(' '))
}

export function interactiveTitle(element: Element, root: Document = document): string {
  const ariaLabel = normalizedText(element.getAttribute('aria-label'))
  if (ariaLabel) return ariaLabel

  const ariaLabelledBy = labelledByText(element, root)
  if (ariaLabelledBy) return ariaLabelledBy

  const associatedLabel = associatedLabelText(element)
  if (associatedLabel) return associatedLabel

  if (element instanceof HTMLSelectElement) {
    const selectedOption = normalizedText(element.selectedOptions[0]?.textContent)
    if (selectedOption) return selectedOption
  }

  if (element instanceof HTMLInputElement && ['button', 'submit', 'reset'].includes(element.type)) {
    const value = normalizedText(element.value)
    if (value) return value
  }

  const visibleText = normalizedText(element.textContent)
  if (visibleText) return conciseTitle(visibleText)

  return normalizedText(element.getAttribute('placeholder'))
}

export function installInteractiveTitles(root: Document = document): () => void {
  const generatedTitles = new WeakMap<Element, string>()
  const managedElements = new Set<Element>()

  const sync = (element: Element) => {
    if (!element.matches(INTERACTIVE_SELECTOR)) return

    const generatedTitle = generatedTitles.get(element)
    const currentTitle = normalizedText(element.getAttribute('title'))
    if (currentTitle && currentTitle !== generatedTitle) {
      generatedTitles.delete(element)
      managedElements.delete(element)
      element.removeAttribute(AUTO_TITLE_ATTRIBUTE)
      return
    }

    const nextTitle = interactiveTitle(element, root)
    if (!nextTitle) {
      if (generatedTitle && currentTitle === generatedTitle) element.removeAttribute('title')
      generatedTitles.delete(element)
      managedElements.delete(element)
      element.removeAttribute(AUTO_TITLE_ATTRIBUTE)
      return
    }

    if (currentTitle !== nextTitle) element.setAttribute('title', nextTitle)
    element.setAttribute(AUTO_TITLE_ATTRIBUTE, 'true')
    generatedTitles.set(element, nextTitle)
    managedElements.add(element)
  }

  const scan = (node: Node) => {
    const element = node instanceof Element ? node : node.parentElement
    if (!element) return
    sync(element)
    if (node instanceof Element) node.querySelectorAll(INTERACTIVE_SELECTOR).forEach(sync)
    if (element instanceof HTMLLabelElement && element.control) sync(element.control)
    const interactiveParent = element.closest(INTERACTIVE_SELECTOR)
    if (interactiveParent) sync(interactiveParent)
    const parentLabel = element.closest('label')
    if (parentLabel instanceof HTMLLabelElement && parentLabel.control) sync(parentLabel.control)
    if (element.id) {
      root.querySelectorAll<HTMLElement>('[aria-labelledby]').forEach((candidate) => {
        const referencedIds = candidate.getAttribute('aria-labelledby')?.split(/\s+/) ?? []
        if (referencedIds.includes(element.id)) sync(candidate)
      })
    }
  }

  const release = (node: Node) => {
    if (!(node instanceof Element)) return
    const elements = [node, ...node.querySelectorAll(INTERACTIVE_SELECTOR)]
    elements.forEach((element) => {
      generatedTitles.delete(element)
      managedElements.delete(element)
    })
  }

  root.querySelectorAll(INTERACTIVE_SELECTOR).forEach(sync)
  const observer = new MutationObserver((records) => {
    records.forEach((record) => {
      scan(record.target)
      record.addedNodes.forEach(scan)
      record.removedNodes.forEach(release)
    })
  })
  observer.observe(root.documentElement, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['aria-label', 'aria-labelledby', 'placeholder', 'value', 'for', 'id'],
  })

  return () => {
    observer.disconnect()
    managedElements.forEach((element) => {
      const generatedTitle = generatedTitles.get(element)
      if (generatedTitle && normalizedText(element.getAttribute('title')) === generatedTitle) element.removeAttribute('title')
      element.removeAttribute(AUTO_TITLE_ATTRIBUTE)
    })
    managedElements.clear()
  }
}
