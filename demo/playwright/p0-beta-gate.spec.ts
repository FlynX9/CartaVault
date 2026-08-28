import { expect, test } from '@playwright/test'

import { collectCriticalRuntimeErrors, francePlace, loginAs, openMap, openTrip, openTripSettings, routeInActiveMap, switchTrip } from './p0.helpers'

test.describe.configure({ mode: 'serial' })

test('P0-01 Login → Dashboard → Logout → protected route', async ({ page }) => {
  const assertNoRuntimeErrors = collectCriticalRuntimeErrors(page)
  await page.goto('/dashboard')
  await expect(page).toHaveURL(/\/login/)

  await loginAs(page, 'owner')
  await expect(page.getByRole('heading', { name: /Bonjour.*Camille|Hello.*Camille/ }).first()).toBeVisible()
  await openMap(page, 'Carnet de France')

  await page.getByRole('button', { name: /menu utilisateur/i }).click()
  await page.getByRole('menuitem', { name: /déconnexion|log out|logout/i }).click()
  await expect(page).toHaveURL(/\/login/)
  await page.goto('/dashboard')
  await expect(page).toHaveURL(/\/login/)
  assertNoRuntimeErrors()
})

test('P0-02 Viewer read-only', async ({ page }) => {
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

  await openTrip(page, 'Escapade culturelle')
  await expect(page.getByRole('button', { name: /afficher les paramètres de la sortie|show trip settings/i })).toHaveCount(0)
  expect(mutations, 'Viewer browsing must not submit a mutation').toEqual([])
  assertNoRuntimeErrors()
})

test('P0-03 Switch France → Italy', async ({ page }) => {
  const assertNoRuntimeErrors = collectCriticalRuntimeErrors(page)
  await loginAs(page, 'editor')
  await openMap(page, 'Carnet de France')
  await expect(page.getByText('Atelier des Ocres', { exact: true }).first()).toBeVisible()

  await openMap(page, 'Grand tour d’Italie')
  await expect(page).toHaveURL(/\/maps\//)
  await expect(page.getByText('Belvedere delle Colline', { exact: true }).first()).toBeVisible()
  await expect(page.getByText('Atelier des Ocres', { exact: true })).toHaveCount(0)
  await expect(page.getByRole('complementary', { name: /lieux|places/i })).toBeVisible()
  assertNoRuntimeErrors()
})

test('P0-04 Editor POI create / edit / delete', async ({ page }) => {
  const assertNoRuntimeErrors = collectCriticalRuntimeErrors(page)
  const name = 'P0 E2E POI deterministic'
  const updatedName = `${name} updated`
  await loginAs(page, 'editor')
  await openMap(page, 'Carnet de France')
  await page.goto(routeInActiveMap(page, '/places/new'))
  await expect(page.getByRole('heading', { name: /ajouter un poi|add a poi/i })).toBeVisible()
  await page.getByRole('textbox', { name: /nom/i }).fill(name)
  await page.getByRole('textbox', { name: /description/i }).fill('Créé et supprimé par la validation P0.')
  await page.getByRole('spinbutton', { name: /latitude/i }).fill('48.8566')
  await page.getByRole('spinbutton', { name: /longitude/i }).fill('2.3522')
  await page.getByRole('button', { name: /créer le poi|create poi/i }).click()
  await expect(page.getByRole('region', { name: `Détails de ${name}` })).toBeVisible()
  await expect(page.getByText('Créé et supprimé par la validation P0.')).toBeVisible()

  await page.getByRole('button', { name: /modifier le poi|edit poi/i }).click()
  await page.getByRole('textbox', { name: /nom/i }).fill(updatedName)
  await page.getByRole('button', { name: /enregistrer les modifications|save changes/i }).click()
  await expect(page.getByRole('region', { name: `Détails de ${updatedName}` })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('region', { name: `Détails de ${updatedName}` })).toBeVisible()

  await page.getByRole('button', { name: /supprimer le poi|delete poi/i }).click()
  const confirmation = page.getByRole('alertdialog').filter({ hasText: /supprimer ce lieu|delete this place/i })
  await expect(confirmation).toBeVisible()
  await confirmation.getByRole('button', { name: /supprimer|delete/i }).click()
  await expect(page.getByRole('region', { name: `Détails de ${updatedName}` })).toHaveCount(0)
  await page.getByRole('button', { name: /corbeille|trash/i }).click()
  await expect(page.getByText(updatedName, { exact: true })).toBeVisible()
  assertNoRuntimeErrors()
})

test('P0-05 Dirty POI navigation guard', async ({ page }) => {
  const assertNoRuntimeErrors = collectCriticalRuntimeErrors(page)
  await loginAs(page, 'editor')
  await openMap(page, 'Carnet de France')
  const editRoute = routeInActiveMap(page, `/places/${francePlace.id}/edit`)
  await page.goto(editRoute)
  const name = page.getByRole('textbox', { name: /nom/i })
  await expect(name).toHaveValue(francePlace.name)
  await name.fill('P0 discarded POI draft')
  await page.getByRole('button', { name: /mes cartes|my maps|^maps$/i }).click()
  const guard = page.getByRole('alertdialog').filter({ hasText: /quitter sans enregistrer|leave without saving/i })
  await expect(guard).toBeVisible()
  await guard.getByRole('button', { name: /continuer l’édition|continue editing/i }).click()
  await expect(name).toHaveValue('P0 discarded POI draft')

  await page.getByRole('button', { name: /mes cartes|my maps|^maps$/i }).click()
  await expect(guard).toBeVisible()
  await guard.getByRole('button', { name: /quitter sans enregistrer|leave without saving/i }).click()
  await expect(page).not.toHaveURL(/\/edit/)
  await page.goto(editRoute)
  await expect(page.getByRole('textbox', { name: /nom/i })).toHaveValue(francePlace.name)
  assertNoRuntimeErrors()
})

test('P0-06 Open Trip / switch Trip', async ({ page }) => {
  const assertNoRuntimeErrors = collectCriticalRuntimeErrors(page)
  await loginAs(page, 'viewer')
  await openTrip(page, 'Escapade culturelle')
  await expect(page.getByText('Journée 1', { exact: true }).first()).toBeVisible()
  await expect(page.getByText('Journée 2', { exact: true }).first()).toBeVisible()

  await switchTrip(page, 'Grand tour responsable')
  await expect(page).toHaveURL(/\/travels\//)
  await expect(page.getByText('Grand tour responsable', { exact: true }).first()).toBeVisible()
  await expect(page.getByText('Journée 5', { exact: true }).first()).toBeVisible()
  await expect(page.getByText('Escapade culturelle', { exact: true })).toHaveCount(0)
  assertNoRuntimeErrors()
})

test('P0-07 Edit multi-day Trip and retain planning data', async ({ page }) => {
  const assertNoRuntimeErrors = collectCriticalRuntimeErrors(page)
  const original = 'Grand tour responsable'
  const updated = `${original} P0`
  await loginAs(page, 'editor')
  await openTrip(page, original)
  await openTripSettings(page)
  const name = page.getByRole('textbox', { name: /nom du voyage|trip name/i })
  await name.fill(updated)
  await expect(page.getByText('Non enregistré', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: /^Enregistrer$|^Save$/i }).click()
  await expect(page.getByText('Enregistré', { exact: true })).toBeVisible()
  await page.reload()
  await expect(page.getByText(updated, { exact: true }).first()).toBeVisible()
  await expect(page.getByText('Journée 5', { exact: true }).first()).toBeVisible()
  await expect(page.getByRole('button', { name: /nuit valide nuit 1/i })).toBeVisible()
  await expect(page.getByLabel(/chiffres clés du voyage|trip key figures/i)).toBeVisible()

  await openTripSettings(page)
  await page.getByRole('textbox', { name: /nom du voyage|trip name/i }).fill(original)
  await page.getByRole('button', { name: /^Enregistrer$|^Save$/i }).click()
  await expect(page.getByText(original, { exact: true }).first()).toBeVisible()
  assertNoRuntimeErrors()
})

test('P0-08 Dirty Trip / Admin navigation guard', async ({ page }) => {
  const assertNoRuntimeErrors = collectCriticalRuntimeErrors(page)
  await loginAs(page, 'owner')
  await openTrip(page, 'Escapade culturelle')
  await openTripSettings(page)
  const name = page.getByRole('textbox', { name: /nom du voyage|trip name/i })
  await name.fill('P0 unsaved trip draft')
  await page.getByRole('button', { name: /mes sorties|my trips/i }).click()
  const unsaved = page.getByRole('alertdialog', { name: /enregistrer les paramètres/i })
  await expect(unsaved).toBeVisible()
  await unsaved.getByRole('button', { name: /annuler/i }).click()
  await expect(name).toHaveValue('P0 unsaved trip draft')

  await page.getByRole('button', { name: /menu utilisateur/i }).click()
  await page.getByRole('menuitem', { name: /administration/i }).click()
  await expect(unsaved).toBeVisible()
  await unsaved.getByRole('button', { name: /ne pas enregistrer|discard/i }).click()
  await expect(page).toHaveURL(/\/admin\/general/)
  await expect(page.getByRole('dialog', { name: /administration/i })).toBeVisible()
  assertNoRuntimeErrors()
})

test('P0-09 Admin / role boundaries', async ({ browser }) => {
  for (const user of ['viewer', 'editor'] as const) {
    const context = await browser.newContext({ locale: 'fr-FR', timezoneId: 'Europe/Paris', viewport: { width: 1440, height: 900 } })
    const page = await context.newPage()
    const assertNoRuntimeErrors = collectCriticalRuntimeErrors(page)
    await loginAs(page, user)
    await page.getByRole('button', { name: /menu utilisateur/i }).click()
    await expect(page.getByRole('menuitem', { name: /administration/i })).toHaveCount(0)
    await page.goto('/admin/users')
    await expect(page).not.toHaveURL(/\/admin/)
    assertNoRuntimeErrors()
    await context.close()
  }

  const ownerContext = await browser.newContext({ locale: 'fr-FR', timezoneId: 'Europe/Paris', viewport: { width: 1440, height: 900 } })
  const owner = await ownerContext.newPage()
  const assertNoRuntimeErrors = collectCriticalRuntimeErrors(owner)
  await loginAs(owner, 'owner')
  await owner.getByRole('button', { name: /menu utilisateur/i }).click()
  await owner.getByRole('menuitem', { name: /administration/i }).click()
  await expect(owner.getByRole('dialog', { name: /administration/i })).toBeVisible()
  assertNoRuntimeErrors()
  await ownerContext.close()
})

test('P0-10 Expired / revoked session', async ({ page, context }) => {
  const assertNoRuntimeErrors = collectCriticalRuntimeErrors(page)
  await loginAs(page, 'owner')
  await expect(page.getByRole('heading', { name: /Bonjour.*Camille|Hello.*Camille/ }).first()).toBeVisible()

  const expired = page.waitForResponse((response) => response.url().includes('/api/auth/me') && response.status() === 401)
  await context.clearCookies()
  await page.reload()
  await expired
  await expect(page).toHaveURL(/\/login/)
  await expect(page.getByRole('heading', { name: /Bonjour.*Camille|Hello.*Camille/ })).toHaveCount(0)
  await loginAs(page, 'owner')
  await expect(page.getByRole('heading', { name: /Bonjour.*Camille|Hello.*Camille/ }).first()).toBeVisible()
  assertNoRuntimeErrors()
})
