import { expect, test } from '@playwright/test'

const ownerEmail = 'demo.owner@cartavault.local'
const ownerPassword = process.env.DEMO_OWNER_PASSWORD ?? 'CartaVaultDemo!2026'

async function loginAsOwner(page: import('@playwright/test').Page) {
  await page.goto('/login')
  await page.locator('input[type="email"]').fill(ownerEmail)
  await page.locator('input[type="password"]').fill(ownerPassword)
  await page.locator('form button[type="submit"]').click()
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 })
}

test.describe('documentation embarquée', () => {
  test('la recherche plein texte retourne les pages fonctionnelles', async ({ page }) => {
    const pageErrors: string[] = []
    page.on('pageerror', (error) => pageErrors.push(error.message))

    await page.goto('/docs/fr/')
    await page.getByRole('button', { name: 'Search' }).click()
    await page.getByRole('textbox', { name: 'Search' }).fill('TOTP')

    await expect(page.getByRole('dialog')).toContainText(
      /Configurer l.authentification TOTP|Authentification TOTP/,
    )
    expect(pageErrors).toEqual([])
  })

  test('la navigation documentaire devient un drawer sur mobile', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/docs/fr/account/security/totp/')

    const menuButton = page.getByRole('button', { name: /Menu|menu/i })
    await expect(menuButton).toBeVisible()
    await menuButton.click()
    await expect(
      page.getByRole('navigation', { name: 'Main' }).getByRole('link', {
        name: 'Configurer l’authentification TOTP',
      }),
    ).toBeVisible()
  })

  test('le menu utilisateur mobile ouvre la documentation locale dans un nouvel onglet', async ({ context, page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await loginAsOwner(page)

    await page.getByRole('button', { name: /Menu utilisateur/ }).click()
    const documentationLink = page.getByRole('menuitem', { name: 'Documentation' })
    await expect(documentationLink).toBeVisible()
    await expect(documentationLink).toHaveAttribute('href', /\/docs\/$/)

    const [documentationPage] = await Promise.all([
      context.waitForEvent('page'),
      documentationLink.click(),
    ])
    await documentationPage.waitForLoadState('domcontentloaded')
    await expect(documentationPage).toHaveURL(/\/docs\/fr\/$/)
    await expect(documentationPage.getByRole('heading', { name: 'Documentation CartaVault' })).toBeVisible()
  })
})
