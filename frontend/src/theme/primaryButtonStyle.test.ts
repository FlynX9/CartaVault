/// <reference types="node" />

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// index.css mixes LF and CRLF line endings; normalize before matching anchors.
const stylesheet = readFileSync('src/index.css', 'utf8').replace(/\r\n/g, '\n')
const contractStart = stylesheet.indexOf('/*\n * Canonical primary CTA skin.')
const primaryContract = stylesheet.slice(contractStart)

describe('CartaVault primary button visual contract', () => {
  it('defines one shared gradient and abstract overlay for primary aliases', () => {
    expect(contractStart).toBeGreaterThan(-1)
    expect(stylesheet).toContain('--cv-button-primary-bg-start: var(--cv-color-teal)')
    expect(stylesheet).toContain('--cv-button-primary-bg-end:')
    expect(primaryContract).toMatch(/\.primary-button,[\s\S]*\.account-button--primary,[\s\S]*\.positive-button,/)
    expect(primaryContract).toMatch(/background:\s*linear-gradient\(135deg, var\(--cv-button-primary-bg-start\), var\(--cv-button-primary-bg-end\)\)/)
    expect(primaryContract).toMatch(/\)::before\s*\{[\s\S]*right:\s*-18%;[\s\S]*border-radius:\s*45% 55% 60% 40% \/ 38% 47% 53% 62%;/)
  })

  it('keeps the overlay passive and supports interaction and motion preferences', () => {
    expect(primaryContract).toMatch(/pointer-events:\s*none/)
    expect(primaryContract).toMatch(/:focus-visible\s*\{[\s\S]*outline:\s*2px solid/)
    expect(primaryContract).toMatch(/:active\s*\{[\s\S]*transform:\s*translateY\(1px\)/)
    expect(primaryContract).toMatch(/:is\(:disabled, \[aria-disabled='true'\]\)/)
    expect(primaryContract).toContain('@media (prefers-reduced-motion: reduce)')
  })

  it('does not opt danger actions into the emerald contract', () => {
    expect(primaryContract).not.toMatch(/\n\s*\.danger-button,?\n/)
  })

  it('keeps the Maps creation label visible at its natural width', () => {
    expect(stylesheet).toMatch(/\.maps-workspace-panel \.panel-create-action[\s\S]*width:\s*auto !important;[\s\S]*min-width:\s*max-content !important;[\s\S]*align-items:\s*center;/)
    expect(stylesheet).toMatch(/\.maps-workspace-panel \.panel-create-action \.panel-create-action__label\s*\{[\s\S]*display:\s*block;[\s\S]*line-height:\s*1;[\s\S]*white-space:\s*nowrap;/)
  })
})
