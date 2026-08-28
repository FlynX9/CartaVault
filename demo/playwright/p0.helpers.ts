import { expect, type Page } from '@playwright/test'

export const users = {
  owner: { email: 'demo.owner@cartavault.local', password: process.env.DEMO_OWNER_PASSWORD ?? 'CartaVaultDemo!2026' },
  editor: { email: 'demo.editor@cartavault.local', password: process.env.DEMO_OWNER_PASSWORD ?? 'CartaVaultDemo!2026' },
  viewer: { email: 'demo.viewer@cartavault.local', password: process.env.DEMO_OWNER_PASSWORD ?? 'CartaVaultDemo!2026' },
} as const

export type DemoUser = keyof typeof users

export const francePlace = {
  id: '07503ba8-417f-53fb-9fbb-f685d9df2ec3',
  name: 'Atelier des Ocres',
}

export async function loginAs(page: Page, user: DemoUser) {
  await page.goto('/login')
  await page.getByRole('textbox', { name: /adresse e-?mail|email/i }).fill(users[user].email)
  await page.getByRole('textbox', { name: /mot de passe|password/i }).fill(users[user].password)
  await page.getByRole('textbox', { name: /mot de passe|password/i }).press('Enter')
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 })
}

export async function openMap(page: Page, name: string) {
  await page.getByRole('button', { name: /mes cartes|my maps|^maps$|carnet de france|grand tour d’italie/i }).first().click()
  const panel = page.getByRole('complementary', { name: /cartes|maps/i })
  await expect(panel).toBeVisible()
  const open = panel.getByRole('button', { name: new RegExp(`ouvrir ${escapeRegex(name)}|open ${escapeRegex(name)}`, 'i') })
  await open.click()
  await expect(page.locator('.leaflet-container, .maplibregl-map').first()).toBeVisible({ timeout: 20_000 })
}

export async function openTrip(page: Page, name: string) {
  await selectTripFromLibrary(page, name)
  await expect(page).toHaveURL(/\/travels\//, { timeout: 15_000 })
  await expect(page.getByText(name, { exact: true }).first()).toBeVisible()
}

export async function switchTrip(page: Page, name: string) {
  await selectTripFromLibrary(page, name)
  await expect(page).toHaveURL(/\/travels\//, { timeout: 15_000 })
  await expect(page.getByText(name, { exact: true }).first()).toBeVisible()
}

async function selectTripFromLibrary(page: Page, name: string) {
  await page.getByRole('button', { name: /mes sorties|my trips/i }).click()
  const library = page.getByRole('complementary', { name: /sorties|trips/i })
  await expect(library).toBeVisible({ timeout: 20_000 })
  const card = library.getByRole('listitem').filter({ hasText: name })
  await expect(card).toBeVisible({ timeout: 20_000 })
  await card.getByRole('button', { name: /ouvrir|open/i }).click()
}

export async function openTripSettings(page: Page) {
  await page.getByRole('button', { name: /actions de la carte|map actions/i }).click()
  await page.getByRole('menuitem', { name: /paramètres de la sortie|trip settings/i }).click()
  await expect(page.getByText(/paramètres de la sortie|trip settings/i).last()).toBeVisible()
}

export function routeInActiveMap(page: Page, suffix = '') {
  const mapId = new URL(page.url()).pathname.match(/^\/maps\/([^/]+)/)?.[1]
  if (!mapId) throw new Error(`No active map route after opening a map: ${page.url()}`)
  return `/maps/${mapId}${suffix}`
}

export function collectCriticalRuntimeErrors(page: Page) {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('response', (response) => {
    if (response.status() >= 500 && response.url().includes('/api/')) errors.push(`${response.status()} ${response.url()}`)
  })
  return () => expect(errors, 'Unexpected browser exception or API 5xx').toEqual([])
}

export function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
}
