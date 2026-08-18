import { readFileSync } from 'node:fs'
import { createHmac } from 'node:crypto'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { expect, test, type Page } from '@playwright/test'

type Scenario = {
  id: string
  route: string
  user?: 'owner' | 'editor' | 'viewer'
  theme?: 'light' | 'dark'
  language?: 'fr' | 'en'
  view?: 'place-popup' | 'place-editor' | 'place-media' | 'place-annotations' | 'trip' | 'timeline' | 'trip-routing' | 'trip-export' | 'trip-offline' | 'media' | 'media-upload' | 'media-gps' | 'kmz-import' | 'maps' | 'create-map' | 'map-fields' | 'map-members' | 'map-export' | 'map-offline' | 'categories' | 'tags' | 'statuses' | 'profile-import' | 'tag-profile-import' | 'status-profile-import' | 'annotation-templates' | 'trash' | 'account' | 'account-preferences' | 'account-security' | 'account-email' | 'account-password' | 'account-totp' | 'account-recovery-codes' | 'account-email-mfa' | 'account-sessions' | 'account-api-keys' | 'account-api-key-dialog' | 'account-privacy' | 'account-offline' | 'account-delete' | 'admin' | 'admin-registration' | 'admin-user-details' | 'admin-quota-edit' | 'admin-vector' | 'admin-privacy' | 'admin-media-logs'
  mobile?: boolean
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
  if (scenario.mobile) await page.setViewportSize({ width: 390, height: 844 })
  await page.addInitScript(({ theme, language }) => {
    if (theme) localStorage.setItem('cartavault.theme', theme)
    if (language) {
      localStorage.setItem('cartavault.locale', language)
      Object.defineProperty(window.navigator, 'language', { configurable: true, get: () => language === 'fr' ? 'fr-FR' : 'en-US' })
      Object.defineProperty(window.navigator, 'languages', { configurable: true, get: () => language === 'fr' ? ['fr-FR', 'fr'] : ['en-US', 'en'] })
    }
  }, scenario)
  await page.emulateMedia({ colorScheme: scenario.theme ?? 'light', reducedMotion: 'reduce' })
}

async function setAccountLanguage(page: Page, language: NonNullable<Scenario['language']>) {
  const result = await page.evaluate(async (nextLanguage) => {
    const userResponse = await fetch('/api/auth/me', { credentials: 'include', cache: 'no-store' })
    const user = await userResponse.json() as { csrf_token?: string }
    const preferencesResponse = await fetch('/api/account/preferences', { credentials: 'include', cache: 'no-store' })
    const preferences = await preferencesResponse.json() as Record<string, unknown>
    const updateResponse = await fetch('/api/account/preferences', {
      method: 'PUT',
      credentials: 'include',
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': user.csrf_token ?? '',
      },
      body: JSON.stringify({ ...preferences, language: nextLanguage, preferred_basemap: 'osm' }),
    })
    return { status: updateResponse.status, body: await updateResponse.text() }
  }, language)
  expect(result.status, `Unable to switch demo account to ${language}: ${result.body}`).toBe(200)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await expect(page.locator('html')).toHaveAttribute('lang', language)
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

async function waitForScenarioShell(page: Page, scenario: Scenario) {
  const isFrench = scenario.language !== 'en'
  if (scenario.route === '/login') {
    await expect(page.locator('form').filter({ has: page.locator('input[type="email"]') })).toBeVisible()
    return
  }
  if (scenario.route.startsWith('/dashboard')) {
    await expect(page.getByRole('heading', { name: isFrench ? /Bonjour/ : /Hello/ }).first()).toBeVisible({ timeout: 20_000 })
    await expect(page.locator('.dashboard-page')).toBeVisible()
    return
  }
  if (scenario.route.startsWith('/admin/')) {
    await expect(page.getByRole('dialog', { name: 'Administration' })).toBeVisible({ timeout: 20_000 })
    return
  }

  await expect(page.locator('.leaflet-container, .maplibregl-map').first()).toBeVisible({ timeout: 20_000 })
  const startsFromPlaces = !scenario.view
  if (startsFromPlaces) {
    const placesPanel = page.getByRole('complementary', { name: isFrench ? 'Lieux' : 'Places' })
    await expect(placesPanel).toBeVisible({ timeout: 20_000 })
    await expect(placesPanel.locator('.places-place-card, .place-list-item, .places-gallery-card').first()).toBeVisible({ timeout: 20_000 })
  } else {
    await expect(page.getByRole('navigation', { name: /Navigation CartaVault|CartaVault navigation/ })).toBeVisible({ timeout: 20_000 })
  }
}

async function enableTotpForDocumentation(page: Page) {
  const setupResult = await page.evaluate(async () => {
    const request = async (path: string, init: RequestInit = {}) => {
      const me = await fetch('/api/auth/me', { credentials: 'include', cache: 'no-store' }).then((response) => response.json()) as { csrf_token?: string }
      return fetch(path, {
        ...init,
        credentials: 'include',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': me.csrf_token ?? '', ...(init.headers ?? {}) },
      })
    }
    const status = await request('/api/account/security/totp')
    const current = await status.json() as { enabled: boolean }
    if (current.enabled) return { status: 200, body: 'already enabled', secret: null }
    const setupResponse = await request('/api/account/security/totp/setup', { method: 'POST', body: '{}' })
    const setup = await setupResponse.json() as { secret?: string }
    return { status: setupResponse.status, body: JSON.stringify(setup), secret: setup.secret ?? null }
  })
  expect(setupResult.status, `Unable to prepare the recovery-code documentation state: ${setupResult.body}`).toBe(200)
  if (!setupResult.secret) return

  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  let bits = ''
  for (const character of setupResult.secret.replace(/=+$/u, '').toUpperCase()) bits += alphabet.indexOf(character).toString(2).padStart(5, '0')
  const key = Buffer.alloc(Math.floor(bits.length / 8))
  for (let index = 0; index < key.length; index += 1) key[index] = Number.parseInt(bits.slice(index * 8, index * 8 + 8), 2)
  const counter = Math.floor(Date.now() / 30_000)
  const message = Buffer.alloc(8)
  message.writeBigUInt64BE(BigInt(counter))
  const digest = createHmac('sha1', key).update(message).digest()
  const offset = digest[digest.length - 1] & 0x0f
  const value = ((digest[offset] & 0x7f) << 24) | (digest[offset + 1] << 16) | (digest[offset + 2] << 8) | digest[offset + 3]
  const code = String(value % 1_000_000).padStart(6, '0')
  const confirmation = await page.evaluate(async (totpCode) => {
    const me = await fetch('/api/auth/me', { credentials: 'include', cache: 'no-store' }).then((response) => response.json()) as { csrf_token?: string }
    const response = await fetch('/api/account/security/totp/confirm', { method: 'POST', credentials: 'include', cache: 'no-store', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': me.csrf_token ?? '' }, body: JSON.stringify({ code: totpCode }) })
    return { status: response.status, body: await response.text() }
  }, code)
  expect(confirmation.status, `Unable to confirm the recovery-code documentation state: ${confirmation.body}`).toBe(200)
}

async function prepareScenario(page: Page, scenario: Scenario) {
  const isFrench = scenario.language !== 'en'
  if (scenario.view === 'place-popup' || scenario.view === 'place-editor' || scenario.view === 'place-media' || scenario.view === 'place-annotations') {
    const placeName = scenario.view === 'place-annotations' ? 'Passage des Verrières' : 'Atelier des Ocres'
    const placeId = scenario.view === 'place-annotations'
      ? '08001ad9-91bf-5182-a295-d4eaefb913fe'
      : '07503ba8-417f-53fb-9fbb-f685d9df2ec3'
    await page.goto(`/places/${placeId}${new URL(page.url()).search}`)
    await expect(page).toHaveURL(/\/places\/[^/]+/)
    const popup = page.locator('.place-map-popup')
    await expect(popup).toBeVisible()
    await expect(popup.getByRole('heading', { name: placeName })).toBeVisible()
    if (scenario.view === 'place-editor' || scenario.view === 'place-media') {
      const editButton = popup.getByRole('button', { name: /Modifier le POI|Edit POI/ })
      if (scenario.mobile) await editButton.dispatchEvent('click')
      else await editButton.click()
      await expect(page).toHaveURL(/\/places\/[^/]+\/edit/)
      await expect(page.getByRole('heading', { name: /Modifier|Edit/ })).toBeVisible()
      if (scenario.view === 'place-media') {
        const manager = page.locator('.photo-manager')
        await expect(manager.getByRole('heading', { name: 'Photos', exact: true })).toBeVisible()
        await manager.scrollIntoViewIfNeeded()
        const image = manager.locator('.photo-gallery-main__image img').first()
        await expect(image).toBeVisible()
        await expect.poll(() => image.evaluate((element: HTMLImageElement) => element.complete && element.naturalWidth > 0)).toBe(true)
      }
    } else if (scenario.view === 'place-annotations') {
      const annotationsButton = popup.getByRole('button', { name: /Plan \/ annotations/ })
      if (scenario.mobile) await annotationsButton.dispatchEvent('click')
      else await annotationsButton.click()
      await expect(popup.locator('.popup-annotations__body')).toBeVisible()
      await expect(popup.getByText(/Parking — démonstration/)).toBeVisible()
    }
    return
  }

  if (scenario.view === 'maps' || scenario.view === 'create-map' || scenario.view === 'map-fields' || scenario.view === 'map-members' || scenario.view === 'map-export' || scenario.view === 'map-offline') {
    await page.getByRole('button', { name: isFrench ? 'Coffre' : 'Vault', exact: true }).click()
    const panel = page.getByRole('complementary', { name: /Cartes|Maps/ })
    await expect(panel).toBeVisible()
    if (scenario.view === 'create-map') {
      await panel.getByRole('button', { name: /Créer une carte|Create a map/ }).click()
      await expect(page.getByRole('dialog', { name: /Créer une carte|Create a map/ })).toBeVisible()
    } else if (scenario.view === 'map-fields') {
      await panel.getByRole('button', { name: /Configurer les champs.*Carnet de France|Configure fields for Carnet de France/ }).click()
      await expect(page.getByRole('dialog', { name: /Champs des POI|Place fields/ })).toBeVisible()
    } else if (scenario.view === 'map-members') {
      await panel.getByRole('button', { name: /Gérer les membres.*Carnet de France|Manage members of Carnet de France/ }).click()
      await expect(page.getByRole('dialog', { name: /Accès à|Access to/ })).toBeVisible()
    } else if (scenario.view === 'map-export') {
      await panel.getByRole('button', { name: /Exporter Carnet de France|Export Carnet de France/ }).click()
      await expect(page.getByRole('dialog', { name: /Exporter|Export/ })).toBeVisible()
    } else if (scenario.view === 'map-offline') {
      await panel.getByRole('button', { name: /Rendre Carnet de France disponible hors ligne/ }).click()
      await expect(page.getByRole('dialog', { name: /Rendre disponible hors ligne|Make available offline/ })).toBeVisible()
    }
    return
  }

  if (scenario.view === 'categories' || scenario.view === 'tags' || scenario.view === 'statuses' || scenario.view === 'profile-import' || scenario.view === 'tag-profile-import' || scenario.view === 'status-profile-import' || scenario.view === 'annotation-templates' || scenario.view === 'trash') {
    const label = scenario.view === 'annotation-templates' ? 'Annotations' : scenario.view === 'trash' ? (isFrench ? 'Corbeille' : 'Trash') : scenario.view === 'tags' || scenario.view === 'tag-profile-import' ? 'Tags' : scenario.view === 'statuses' || scenario.view === 'status-profile-import' ? (isFrench ? 'Statuts' : 'Statuses') : (isFrench ? 'Catégories' : 'Categories')
    if (scenario.mobile) {
      await page.getByRole('button', { name: 'Organisation', exact: true }).click()
      await page.getByRole('menuitem', { name: label, exact: true }).click()
    } else {
      await page.getByRole('button', { name: label, exact: true }).click()
    }
    const panelHeading = scenario.view === 'statuses' || scenario.view === 'status-profile-import'
      ? 'Statuts'
      : scenario.view === 'categories' || scenario.view === 'profile-import'
        ? 'Catégories'
        : label
    await expect(page.getByRole('heading', { name: panelHeading, exact: true }).first()).toBeVisible()
    if (scenario.view === 'profile-import' || scenario.view === 'tag-profile-import' || scenario.view === 'status-profile-import') {
      const importLabel = scenario.view === 'tag-profile-import' ? /Importer un tag depuis un profil/ : scenario.view === 'status-profile-import' ? /Importer des statuts depuis un profil/ : /Importer une catégorie depuis un profil/
      await page.getByRole('button', { name: importLabel }).click()
      await expect(page.getByRole('dialog', { name: /Importer des catégories|Importer des tags|Importer des statuts/ })).toBeVisible()
    }
    return
  }

  if (scenario.view === 'trip' || scenario.view === 'timeline' || scenario.view === 'trip-routing' || scenario.view === 'trip-export' || scenario.view === 'trip-offline') {
    await page.getByRole('button', { name: isFrench ? 'Sorties' : 'Trips', exact: true }).click()
    const panel = page.getByRole('complementary', { name: isFrench ? 'Sortie' : 'Trips' })
    await expect(panel).toBeVisible()
    if (scenario.mobile) {
      if (scenario.view === 'timeline') {
        await page.getByRole('button', { name: isFrench ? 'Sorties' : 'Trips', exact: true }).click()
        await expect(panel.getByRole('heading', { name: isFrench ? 'Chronologie' : 'Timeline' })).toBeVisible()
        return
      }
      if (scenario.view === 'trip') return
    }
    if (!scenario.mobile) {
      const tripSelector = panel.getByRole('combobox', { name: isFrench ? 'Choisir un voyage' : 'Choose a trip' })
      await expect(tripSelector).toBeVisible()
      await tripSelector.selectOption({ label: 'Escapade culturelle' })
      await expect(panel.getByText('Escapade culturelle', { exact: true }).first()).toBeVisible()
    }
    if (scenario.view === 'timeline') {
      await panel.getByRole('button', { name: /Activer la chronologie du voyage|Enable trip timeline/ }).click()
      await expect(panel.getByRole('heading', { name: isFrench ? 'Chronologie' : 'Timeline' })).toBeVisible()
      if (isFrench) {
        await expect(panel.getByRole('button', { name: 'Jour 1' })).toBeVisible()
        const firstStop = panel.getByRole('button', { name: /^Étape 1 : / }).first()
        await expect(firstStop).toBeVisible()
        await firstStop.click()
        await expect(firstStop).toHaveAttribute('aria-current', 'step')
      }
    } else if (scenario.view === 'trip-routing') {
      if (scenario.mobile) {
        await panel.getByRole('button', { name: 'Plus d’actions pour la sortie' }).click()
        await panel.getByRole('menuitem', { name: 'Paramètres de la sortie' }).click()
      } else {
        await panel.locator('button[title="Paramètres de la sortie"], button[title="Trip settings"]').first().click()
      }
      await expect(panel.getByText(/Paramètres de la sortie|Trip settings/, { exact: true }).last()).toBeVisible()
    } else if (scenario.view === 'trip-export') {
      if (scenario.mobile) {
        await panel.getByRole('button', { name: 'Plus d’actions pour la sortie' }).click()
        await panel.getByRole('menuitem', { name: 'Exporter la sortie' }).click()
      } else {
        await panel.locator('summary[aria-label="Exporter la sortie"], summary[aria-label="Export trip"]').click()
      }
      if (scenario.mobile) await expect(page.getByRole('dialog', { name: 'Options d’export' })).toBeVisible()
      else await expect(panel.getByText(/Exporter en PDF|Export as PDF/, { exact: true })).toBeVisible()
    } else if (scenario.view === 'trip-offline') {
      if (scenario.mobile) {
        await panel.getByRole('button', { name: 'Plus d’actions pour la sortie' }).click()
        await panel.getByRole('menuitem', { name: 'Mettre hors-ligne' }).click()
      } else {
        await panel.getByRole('button', { name: /Rendre cette sortie disponible hors ligne|Make this trip available offline/ }).click()
      }
      await expect(page.getByRole('dialog', { name: /Rendre disponible hors ligne|Make available offline/ })).toBeVisible()
    }
    return
  }

  if (scenario.view === 'media' || scenario.view === 'media-upload' || scenario.view === 'media-gps') {
    await page.getByRole('button', { name: isFrench ? 'Médias' : 'Media', exact: true }).click()
    const panel = page.getByRole('complementary', { name: /Médiathèque|Media library/ })
    await expect(panel).toBeVisible()
    await expect(panel.locator('.media-card')).toHaveCount(18)
    if (scenario.view === 'media-upload') {
      await panel.getByRole('button', { name: /Importer des photos|Import photos/ }).click()
      await expect(page.getByRole('dialog')).toBeVisible()
    } else if (scenario.view === 'media-gps') {
      const gpsMedia = panel.locator('.media-card').filter({ hasText: 'belvedere-paris-gps.webp' })
      await expect(gpsMedia).toBeVisible()
      await expect(gpsMedia.getByRole('button', { name: /Créer un POI|Create a POI/ })).toBeVisible()
      await gpsMedia.getByRole('button', { name: /Ouvrir belvedere-paris-gps.webp|Open belvedere-paris-gps.webp/ }).click()
      await expect(page.getByRole('dialog').getByRole('button', { name: /Créer un POI|Create a POI/ })).toBeVisible()
    }
    return
  }

  if (scenario.view === 'kmz-import') {
    const panel = page.getByRole('complementary', { name: isFrench ? 'Lieux' : 'Places' })
    const importButton = panel.locator('.places-import-kmz')
    if (scenario.mobile) {
      await expect(importButton).toBeHidden()
      await expect(panel.getByRole('link', { name: /Nouveau lieu|New place/ })).toBeVisible()
      return
    }
    for (let attempt = 0; attempt < 2 && !await importButton.isVisible().catch(() => false); attempt += 1) {
      const expandPanel = panel.getByRole('button', { name: /Déployer le panneau Lieux|Expand Places panel/ })
      if (await expandPanel.isVisible().catch(() => false)) await expandPanel.click()
      else await page.getByRole('button', { name: isFrench ? /^(Lieux|Carte)$/ : /^(Places|Map)$/ }).click()
      await page.waitForTimeout(350)
    }
    await expect(importButton).toBeVisible({ timeout: 20_000 })
    await importButton.click()
    await expect(page.getByRole('dialog', { name: /Importer/ })).toBeVisible()
    return
  }

  if (scenario.view?.startsWith('account')) {
    if (scenario.view === 'account-recovery-codes') await enableTotpForDocumentation(page)
    await page.getByRole('button', { name: isFrench ? /^Menu utilisateur de / : / user menu$/ }).click()
    await page.getByRole('menuitem', { name: 'Options' }).click()
    await expect(page.getByRole('dialog', { name: isFrench ? 'Mon compte' : 'My account' })).toBeVisible()
    const account = page.getByRole('dialog', { name: isFrench ? 'Mon compte' : 'My account' })
    if (scenario.view === 'account') {
      await expect(account.getByRole('heading', { name: isFrench ? 'Profil' : 'Profile', exact: true })).toBeVisible()
      return
    }
    const sectionNames = {
      'account-preferences': isFrench ? 'Préférences' : 'Preferences',
      'account-security': isFrench ? 'Sécurité' : 'Security',
      'account-email': isFrench ? 'Sécurité' : 'Security',
      'account-password': isFrench ? 'Sécurité' : 'Security',
      'account-totp': isFrench ? 'Sécurité' : 'Security',
      'account-recovery-codes': isFrench ? 'Sécurité' : 'Security',
      'account-email-mfa': isFrench ? 'Sécurité' : 'Security',
      'account-sessions': isFrench ? 'Sécurité' : 'Security',
      'account-api-keys': isFrench ? 'Clés API' : 'API keys',
      'account-privacy': isFrench ? 'Confidentialité' : 'Privacy',
      'account-offline': isFrench ? 'Données hors ligne' : 'Offline data',
      'account-api-key-dialog': isFrench ? 'Clés API' : 'API keys',
      'account-delete': isFrench ? 'Sécurité' : 'Security',
    } as const
    const sectionName = sectionNames[scenario.view as keyof typeof sectionNames]
    await account.getByRole('button', { name: sectionName, exact: true }).click()
    await expect(account.getByRole('heading', { name: sectionName, exact: true }).first()).toBeVisible()
    if (scenario.view === 'account-email') {
      await account.locator('.account-security-action-card__body').filter({ hasText: isFrench ? 'Adresse e-mail' : 'Email address' }).locator('..').getByRole('button').click()
      await expect(page.getByRole('dialog', { name: isFrench ? 'Changer l’adresse e-mail' : 'Change email address' })).toBeVisible()
    } else if (scenario.view === 'account-password') {
      await account.locator('.account-security-action-card__body').filter({ hasText: isFrench ? 'Mot de passe' : 'Password' }).locator('..').getByRole('button').click()
      await expect(page.getByRole('dialog', { name: isFrench ? 'Changer le mot de passe' : 'Change password' })).toBeVisible()
    } else if (scenario.view === 'account-totp') {
      await account.locator('.account-security-action-list article').filter({ hasText: /Application|Authenticator/ }).getByRole('button').click()
      await expect(page.getByRole('dialog', { name: /Application.*authentification|Authenticator app/ })).toBeVisible()
    } else if (scenario.view === 'account-recovery-codes') {
      await account.locator('.account-security-action-list article').filter({ hasText: /Codes de récupération|Recovery codes/ }).getByRole('button').click()
      await expect(page.getByRole('dialog', { name: /codes de récupération|recovery codes/i })).toBeVisible()
    } else if (scenario.view === 'account-email-mfa') {
      await account.locator('.account-security-action-list article').filter({ hasText: /Code par e-mail|Email code/ }).getByRole('button').click()
      await expect(page.getByRole('dialog', { name: /Code par e-mail|Email code/ })).toBeVisible()
    } else if (scenario.view === 'account-sessions') {
      await account.getByRole('button', { name: /Gérer les sessions|Manage sessions/ }).click()
      await expect(page.getByRole('dialog', { name: /Sessions et appareils|Sessions and devices/ })).toBeVisible()
    } else if (scenario.view === 'account-api-key-dialog') {
      await account.locator('.account-api-key-card').first().getByRole('button', { name: /Modifier|Edit/ }).click()
      await expect(page.getByRole('dialog', { name: /Modifier la clé API|Edit API key/ })).toBeVisible()
    } else if (scenario.view === 'account-delete') {
      await account.getByRole('button', { name: /Supprimer le compte|Delete account/ }).click()
      await expect(page.getByRole('dialog', { name: /Supprimer le compte|Delete account/ })).toBeVisible()
    }
    return
  }

  if (scenario.view?.startsWith('admin')) {
    await expect(page.getByRole('dialog', { name: 'Administration' })).toBeVisible()
    const section = scenario.route.match(/\/admin\/([^?]+)/)?.[1] ?? 'general'
    const sectionHeadings: Record<string, RegExp> = {
      general: /Général|General/,
      users: /Utilisateurs|Users/,
      credentials: /Clés API|API keys/,
      quotas: /Quotas/,
      instance: /État de l’instance|Instance status/,
    }
    await expect(page.getByRole('heading', { name: sectionHeadings[section] }).first()).toBeVisible()
    if (scenario.view === 'admin-registration') {
      await expect(page.getByRole('heading', { name: /Inscriptions publiques|Public registration/ })).toBeVisible()
    } else if (scenario.view === 'admin-user-details') {
      await page.getByRole('button', { name: /Actions pour|Actions for/ }).first().click()
      await page.getByRole('button', { name: /Voir les détails|View details/ }).first().click()
      await expect(page.locator('.admin-user-modal[role="dialog"]')).toBeVisible()
    } else if (scenario.view === 'admin-quota-edit') {
      await page.getByRole('button', { name: /Afficher Voyageur|Show Voyageur/ }).click()
      const quotaCard = page.locator('.quota-profile').filter({ has: page.getByRole('heading', { name: 'Voyageur' }) })
      await quotaCard.locator('button').filter({ hasText: /Modifier|Edit/ }).click()
      const quotaDialog = page.getByRole('dialog', { name: /Modifier Voyageur|Edit Voyageur|Nouveau profil de quotas|New quota profile/ })
      await expect(quotaDialog).toBeVisible()
      await quotaDialog.getByRole('tab', { name: /Cartes & POI|Maps & POIs/, exact: true }).click()
      await expect(quotaDialog.locator('.quota-limit-list')).toBeVisible()
    } else if (scenario.view === 'admin-vector') {
      await expect(page.locator('#vector-basemap-title')).toBeVisible()
      await page.locator('#vector-basemap-title').scrollIntoViewIfNeeded()
    } else if (scenario.view === 'admin-privacy') {
      await expect(page.locator('#privacy-settings-title')).toBeVisible()
      const privacyToggle = page.getByRole('switch', { name: /Activer la confidentialité et la conformité|Enable privacy and compliance/ })
      await expect(privacyToggle).toBeEnabled()
      if (!await privacyToggle.isChecked()) await privacyToggle.check({ force: true })
      await expect(page.getByRole('heading', { name: /Gestion du consentement|Consent management/ })).toBeVisible()
      await page.locator('#privacy-settings-title').scrollIntoViewIfNeeded()
    } else if (scenario.view === 'admin-media-logs') {
      await expect(page.getByRole('heading', { name: /Médiathèque|Media library/ })).toBeVisible()
      await page.getByRole('heading', { name: /Médiathèque|Media library/ }).scrollIntoViewIfNeeded()
    }
  }
}

for (const scenario of scenarios) {
  test(`capture ${scenario.id}`, async ({ page }) => {
    const pageErrors: string[] = []
    const serverErrors: string[] = []
    page.on('pageerror', (error) => pageErrors.push(error.message))
    page.on('response', (response) => {
      if (response.status() >= 500 && response.url().includes('/api/')) serverErrors.push(`${response.status()} ${response.url()}`)
    })
    await stabilize(page, scenario)
    if (scenario.user) await login(page, scenario.user)
    if (scenario.user && scenario.language) await setAccountLanguage(page, scenario.language)
    await page.goto(scenario.route)
    await page.waitForLoadState('domcontentloaded')
    await waitForScenarioShell(page, scenario)
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
    await expect(page.locator('body')).not.toContainText('Chargement de l’espace de travail…')
    await expect(page.locator('body')).not.toContainText('Loading…')
    expect(serverErrors, `API 5xx responses while preparing ${scenario.id}`).toEqual([])
    expect(pageErrors, `Browser errors while preparing ${scenario.id}`).toEqual([])
    await mkdir('/demo/output', { recursive: true })
    // A mobile capture represents the actual handset viewport rather than a
    // long, stitched desktop-style page.
    await page.screenshot({ path: `/demo/output/${scenario.id}.png`, fullPage: !scenario.mobile, animations: 'disabled' })
  })
}
