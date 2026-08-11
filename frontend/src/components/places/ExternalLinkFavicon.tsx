import { Globe2 } from 'lucide-react'
import { useEffect, useState } from 'react'

type FaviconState = 'loading' | 'loaded' | 'failed'

const faviconRequests = new Map<string, Promise<FaviconState>>()

/** Returns a direct, safe favicon candidate for an external HTTP(S) link. */
export function getExternalLinkFaviconUrl(url: string, pageProtocol = typeof window === 'undefined' ? 'https:' : window.location.protocol): string | null {
  try {
    const parsed = new URL(url.trim())
    if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname) return null
    if (pageProtocol === 'https:' && parsed.protocol === 'http:') return null
    return new URL('/favicon.ico', parsed.origin).toString()
  } catch {
    return null
  }
}

function loadFavicon(candidate: string): Promise<FaviconState> {
  const existing = faviconRequests.get(candidate)
  if (existing) return existing

  const request = new Promise<FaviconState>((resolve) => {
    const image = new Image()
    image.onload = () => resolve('loaded')
    image.onerror = () => resolve('failed')
    image.src = candidate
  })
  faviconRequests.set(candidate, request)
  return request
}

/** Test-only reset keeping the production cache private to the module. */
export function resetExternalLinkFaviconCache(): void {
  faviconRequests.clear()
}

export function ExternalLinkFavicon({ url }: { url: string }) {
  const candidate = getExternalLinkFaviconUrl(url)
  const [state, setState] = useState<FaviconState>(candidate ? 'loading' : 'failed')

  useEffect(() => {
    let active = true
    if (!candidate) {
      setState('failed')
      return () => { active = false }
    }
    setState('loading')
    void loadFavicon(candidate).then((nextState) => {
      if (active) setState(nextState)
    })
    return () => { active = false }
  }, [candidate])

  return <span className="place-links-editor__favicon" aria-hidden="true">
    {state === 'loaded' && candidate
      ? <img src={candidate} alt="" referrerPolicy="no-referrer" loading="lazy" onError={() => setState('failed')} />
      : <Globe2 size={16} strokeWidth={1.8} />}
  </span>
}
