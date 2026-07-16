import { describe, expect, it } from 'vitest'

import { resolveApiBaseUrl } from './config'

describe('resolveApiBaseUrl', () => {
  it('uses the same-origin development proxy by default', () => {
    expect(resolveApiBaseUrl(undefined)).toBe('/api')
    expect(resolveApiBaseUrl('')).toBe('/api')
  })

  it('keeps an explicit API URL as the source of truth', () => {
    expect(resolveApiBaseUrl(' https://api.example.test/ '))
      .toBe('https://api.example.test')
  })
})
