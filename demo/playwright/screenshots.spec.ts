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
  view?: 'place-popup' | 'trip' | 'timeline' | 'media' | 'account' | 'admin'
}

const scenarios = JSON.parse(readFileSync(resolve('/demo/screenshots.json'), 'utf8')) as Scenario[]
const credentials = {
  owner: 'demo.owner@cartavault.local',
  editor: 'demo.editor@cartavault.local',
  viewer: 'demo.viewer@cartavault.local',
}
const password = process.env.DEMO_OWNER_PASSWORD ?? 'CartaVaultDemo!2026'
type AuthenticationCookie = Awaited<ReturnType<ReturnType<Page['context']>['cookies']>>[number]
const authenticationCookies = new Map<keyof typeof credentials, AuthenticationCookie[]>()

async function stabilize(page: Page, scenario: Scenario) {
  await page.addInitScript(({ theme, language }) => {
    if (theme) localStorage.setItem('cartavault.theme', theme)
    if (language) localStorage.setItem('cartavault.language', language)
  }, scenario)
  await page.emulateMedia({ colorScheme: scenario.theme ?? 'light', reducedMotion: 'reduce' })
}

async function login(page: Page, user: keyof typeof credentials) {
  const cached = authenticationCookies.get(user)
  if (cached) {
    await page.context().addCookies(cached)
    await page.goto('/dashboard')
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 })
    return
  }
  await page.goto('/login')
  await page.locator('input[type="email"]').fill(credentials[user])
  await page.locator('input[type="password"]').fill(password)
  await page.locator('form button[type="submit"]').click()
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 })
  authenticationCookies.set(user, await page.context().cookies())
}

async function prepareScenario(page: Page, scenario: Scenario) {
  if (scenario.view === 'place-popup') {
    const placeCard = page.getByRole('button', { name: 'Atelier des Ocres', exact: true })
    await expect(placeCard).toBeVisible()
    await placeCard.click()
    const popup = page.locator('.place-map-popup')
    await expect(popup).toBeVisible()
    await expect(popup.getByRole('heading', { name: 'Atelier des Ocres' })).toBeVisible()
    const popupImage = popup.locator('.popup-gallery img')
    await expect(popupImage).toBeVisible()
    await expect.poll(async () => popupImage.evaluate((image) => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0)
    return
  }

  if (scenario.view === 'trip' || scenario.view === 'timeline') {
    await page.getByRole('button', { name: 'Sorties', exact: true }).click()
    const panel = page.getByRole('complementary', { name: 'Préparation de sortie' })
    await expect(panel).toBeVisible()
    const tripSelector = panel.getByRole('combobox', { name: 'Voyage actif' })
    await expect(tripSelector).toBeVisible()
    await tripSelector.selectOption({ label: 'Escapade culturelle' })
    await expect(panel.getByText('Escapade culturelle', { exact: true }).first()).toBeVisible()
    await expect(panel.getByText('Journée 1', { exact: true })).toBeVisible()
    if (scenario.view === 'timeline') {
      await panel.getByRole('button', { name: 'Activer la chronologie du voyage' }).click()
      await expect(panel.getByRole('heading', { name: 'Chronologie' })).toBeVisible()
      await expect(panel.getByRole('button', { name: 'Jour 1' })).toBeVisible()
      const firstStop = panel.getByRole('button', { name: /^Étape 1 : / }).first()
      await expect(firstStop).toBeVisible()
      await firstStop.click()
      await expect(firstStop).toHaveAttribute('aria-current', 'step')
    }
    return
  }

  if (scenario.view === 'media') {
    await page.getByRole('button', { name: 'Médias', exact: true }).click()
    const panel = page.getByRole('complementary', { name: 'Médiathèque' })
    await expect(panel).toBeVisible()
    await expect(panel.locator('.media-card')).toHaveCount(18)
    const thumbnails = panel.locator('.media-card__preview img')
    await expect(thumbnails).toHaveCount(18)
    await expect.poll(async () => thumbnails.evaluateAll((images) => images.filter((image) => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0).length)).toBe(18)
    return
  }

  if (scenario.view === 'account') {
    await page.getByRole('button', { name: /^Menu utilisateur de / }).click()
    await page.getByRole('menuitem', { name: 'Options' }).click()
    await expect(page.getByRole('dialog', { name: 'Mon compte' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Profil', exact: true })).toBeVisible()
    return
  }

  if (scenario.view === 'admin') {
    await expect(page.getByRole('dialog', { name: 'Administration' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Utilisateurs' })).toBeVisible()
  }
}

for (const scenario of scenarios) {
  test(`capture ${scenario.id}`, async ({ page }) => {
    await stabilize(page, scenario)
    if (scenario.user) await login(page, scenario.user)
    await page.goto(scenario.route)
    await page.waitForLoadState('networkidle')
    await prepareScenario(page, scenario)
    await page.addStyleTag({ content: `
      *, *::before, *::after { animation: none !important; transition: none !important; caret-color: transparent !important; }
    ` })
    if (await page.locator('.leaflet-container').count() > 0) {
      const vectorCanvas = page.locator('.maplibregl-canvas')
      if (await vectorCanvas.count() > 0) await expect(vectorCanvas.first()).toBeVisible()
      await page.waitForTimeout(3_000)
    }
    await expect(page.locator('body')).not.toContainText('Internal Server Error')
    await mkdir('/demo/output', { recursive: true })
    await page.screenshot({ path: `/demo/output/${scenario.id}.png`, fullPage: true, animations: 'disabled' })
  })
}
