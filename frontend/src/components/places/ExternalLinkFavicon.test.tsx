import { cleanup, render, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ExternalLinkFavicon, getExternalLinkFaviconUrl, resetExternalLinkFaviconCache } from './ExternalLinkFavicon'

class SuccessfulImage {
  static created = 0
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  constructor() { SuccessfulImage.created += 1 }
  set src(_value: string) { queueMicrotask(() => this.onload?.()) }
}

class FailingImage {
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  set src(_value: string) { queueMicrotask(() => this.onerror?.()) }
}

describe('ExternalLinkFavicon', () => {
  afterEach(() => {
    cleanup()
    resetExternalLinkFaviconCache()
    vi.unstubAllGlobals()
  })

  it('derives favicon.ico from the validated origin, without a path or query', () => {
    expect(getExternalLinkFaviconUrl('https://www.louvre.fr/visiter?lang=fr')).toBe('https://www.louvre.fr/favicon.ico')
  })

  it('does not create an insecure favicon request from an HTTP link in an HTTPS page', () => {
    expect(getExternalLinkFaviconUrl('http://example.org/page', 'https:')).toBeNull()
    expect(getExternalLinkFaviconUrl('javascript:alert(1)')).toBeNull()
  })

  it('shows a decorative favicon after a successful load and shares a request for the same origin', async () => {
    SuccessfulImage.created = 0
    vi.stubGlobal('Image', SuccessfulImage)
    const { container } = render(<><ExternalLinkFavicon url="https://example.org/a" /><ExternalLinkFavicon url="https://example.org/b" /></>)
    await waitFor(() => expect(container.querySelectorAll('img')).toHaveLength(2))
    expect(SuccessfulImage.created).toBe(1)
    for (const favicon of Array.from(container.querySelectorAll('img'))) {
      expect(favicon).toHaveAttribute('src', 'https://example.org/favicon.ico')
      expect(favicon).toHaveAttribute('alt', '')
    }
  })

  it('keeps the CartaVault fallback when the favicon fails or the URL is malformed', async () => {
    vi.stubGlobal('Image', FailingImage)
    const { container } = render(<><ExternalLinkFavicon url="https://example.org" /><ExternalLinkFavicon url="data:text/plain,no" /></>)
    await waitFor(() => expect(container.querySelectorAll('img')).toHaveLength(0))
    expect(container.querySelectorAll('svg')).toHaveLength(2)
  })
})
