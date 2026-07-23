import { describe, expect, it } from 'vitest'

import { resolveInitialLocale, translate } from './i18n'
import { enMessages, frMessages } from './messages'

describe('i18n', () => {
  it('applies preference precedence and normalizes regional browser locales', () => {
    expect(resolveInitialLocale('en', ['fr-FR'], 'fr')).toBe('en')
    expect(resolveInitialLocale(null, ['en-GB', 'fr-FR'], 'fr')).toBe('en')
    expect(resolveInitialLocale(null, ['de-DE'], 'en')).toBe('en')
    expect(resolveInitialLocale(null, ['de-DE'], 'de')).toBe('fr')
  })

  it('supports interpolation and locale plural rules', () => {
    expect(translate('fr', 'common.results', { count: 1 })).toBe('1 résultat')
    expect(translate('en', 'common.results', { count: 3 })).toBe('3 results')
  })

  it('keeps French and English translation keys in parity', () => {
    expect(Object.keys(enMessages).sort()).toEqual(Object.keys(frMessages).sort())
  })
})
