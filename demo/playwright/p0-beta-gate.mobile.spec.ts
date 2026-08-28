import { expect, test } from '@playwright/test'

import { collectCriticalRuntimeErrors, francePlace, loginAs, openMap, routeInActiveMap } from './p0.helpers'

test.use({ viewport: { width: 390, height: 844 } })
test.describe.configure({ mode: 'serial' })

test('P0-01 mobile Auth / session', async ({ page }) => {
  const assertNoRuntimeErrors = collectCriticalRuntimeErrors(page)
  await page.goto('/dashboard')
  await expect(page).toHaveURL(/\/login/)

  await loginAs(page, 'owner')
  await expect(page.getByRole('heading', { name: /Bonjour.*Camille|Hello.*Camille/ }).first()).toBeVisible()
  await openMap(page, 'Carnet de France')
  await expect(page.getByRole('complementary', { name: /lieux|places/i })).toBeVisible()

  await page.getByRole('button', { name: /menu utilisateur/i }).click()
  await page.getByRole('menuitem', { name: /déconnexion|log out|logout/i }).click()
  await expect(page).toHaveURL(/\/login/)
  await page.goto('/dashboard')
  await expect(page).toHaveURL(/\/login/)
  assertNoRuntimeErrors()
})

test('P0-02 mobile Viewer read-only', async ({ page }) => {
  const assertNoRuntimeErrors = collectCriticalRuntimeErrors(page)
  const mutations: string[] = []
  await loginAs(page, 'viewer')
  page.on('request', (request) => {
    if (request.url().includes('/api/') && !['GET', 'HEAD', 'OPTIONS'].includes(request.method())) mutations.push(`${request.method()} ${request.url()}`)
  })

  await openMap(page, 'Carnet de France')
  await page.goto(routeInActiveMap(page, `/places/${francePlace.id}`))
  await expect(page.getByRole('complementary', { name: /lieux|places/i }).getByRole('button', { name: francePlace.name, exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: /modifier le poi|edit poi/i })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /supprimer le poi|delete poi/i })).toHaveCount(0)
  await expect(page.getByRole('link', { name: /nouveau lieu|new place/i })).toHaveCount(0)
  expect(mutations, 'Viewer browsing must not submit a mutation').toEqual([])
  assertNoRuntimeErrors()
})

test('P0-03 mobile France to Italy', async ({ page }) => {
  const assertNoRuntimeErrors = collectCriticalRuntimeErrors(page)
  await loginAs(page, 'editor')
  await openMap(page, 'Carnet de France')
  await expect(page.getByText('Atelier des Ocres', { exact: true }).first()).toBeVisible()

  await openMap(page, 'Grand tour d’Italie')
  await expect(page.getByText('Belvedere delle Colline', { exact: true }).first()).toBeVisible()
  await expect(page.getByText('Atelier des Ocres', { exact: true })).toHaveCount(0)
  await expect(page.getByRole('complementary', { name: /lieux|places/i })).toBeVisible()
  assertNoRuntimeErrors()
})

test('P0-05 mobile Dirty POI navigation guard', async ({ page }) => {
  const assertNoRuntimeErrors = collectCriticalRuntimeErrors(page)
  await loginAs(page, 'editor')
  await openMap(page, 'Carnet de France')
  const editRoute = routeInActiveMap(page, `/places/${francePlace.id}/edit`)
  await page.goto(editRoute, { waitUntil: 'commit' }).catch(() => undefined)
  await expect(page.getByRole('dialog', { name: /modifier le point d’intérêt|edit place/i })).toBeVisible()
  const name = page.getByRole('textbox', { name: /nom/i })
  await expect(name).toHaveValue(francePlace.name)
  await name.fill('P0 mobile discarded POI draft')

  await page.getByRole('button', { name: /fermer le volet|close panel/i }).click()
  const guard = page.getByRole('alertdialog').filter({ hasText: /quitter sans enregistrer|leave without saving/i })
  await expect(guard).toBeVisible()
  await expect(guard.getByRole('button', { name: /continuer l’édition|continue editing/i })).toBeVisible()
  await expect(guard.getByRole('button', { name: /quitter sans enregistrer|leave without saving/i })).toBeVisible()
  await guard.getByRole('button', { name: /continuer l’édition|continue editing/i }).click()
  await expect(name).toHaveValue('P0 mobile discarded POI draft')

  await page.getByRole('button', { name: /fermer le volet|close panel/i }).click()
  await expect(guard).toBeVisible()
  await guard.getByRole('button', { name: /quitter sans enregistrer|leave without saving/i }).click()
  await expect(page).not.toHaveURL(/\/edit/)
  await page.goto(editRoute, { waitUntil: 'commit' }).catch(() => undefined)
  await expect(page.getByRole('dialog', { name: /modifier le point d’intérêt|edit place/i })).toBeVisible()
  await expect(page.getByRole('textbox', { name: /nom/i })).toHaveValue(francePlace.name)
  assertNoRuntimeErrors()
})
