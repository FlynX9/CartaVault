import { readFileSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { expect, test, type Page } from '@playwright/test'

type Scenario = {
  id: string
  route: string
  user?: 'owner' | 'editor' | 'viewer'
  theme?: 'light' | 'dark'
  language?: 'fr' | 'en'
}

const scenarios = JSON.parse(readFileSync(resolve('/demo/screenshots.json'), 'utf8')) as Scenario[]
const credentials = {
  owner: 'demo.owner@cartavault.local',
  editor: 'demo.editor@cartavault.local',
  viewer: 'demo.viewer@cartavault.local',
}
const password = process.env.DEMO_OWNER_PASSWORD ?? 'CartaVaultDemo!2026'
const transparentTile = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+P+/HgAFhQJ/lL2QGQAAAABJRU5ErkJggg==', 'base64')

async function stabilize(page: Page, scenario: Scenario) {
  await page.route(/(tile|tiles|openstreetmap|stadiamaps|maptiler)/i, async (route) => {
    await route.fulfill({ status: 200, contentType: 'image/png', body: transparentTile })
  })
  await page.addInitScript(({ theme, language }) => {
    if (theme) localStorage.setItem('cartavault.theme', theme)
    if (language) localStorage.setItem('cartavault.language', language)
  }, scenario)
  await page.emulateMedia({ colorScheme: scenario.theme ?? 'light', reducedMotion: 'reduce' })
}

async function login(page: Page, user: keyof typeof credentials) {
  await page.goto('/login')
  await page.locator('input[type="email"]').fill(credentials[user])
  await page.locator('input[type="password"]').fill(password)
  await page.locator('form button[type="submit"]').click()
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 })
}

for (const scenario of scenarios) {
  test(`capture ${scenario.id}`, async ({ page }) => {
    await stabilize(page, scenario)
    if (scenario.user) await login(page, scenario.user)
    await page.goto(scenario.route)
    await page.waitForLoadState('networkidle')
    await page.addStyleTag({ content: `
      *, *::before, *::after { animation: none !important; transition: none !important; caret-color: transparent !important; }
      .leaflet-tile-pane { background: linear-gradient(145deg, #e8f2ef, #dbe7ee) !important; }
    ` })
    await expect(page.locator('body')).not.toContainText('Internal Server Error')
    await mkdir('/demo/output', { recursive: true })
    await page.screenshot({ path: `/demo/output/${scenario.id}.png`, fullPage: true, animations: 'disabled' })
  })
}
