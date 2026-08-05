import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './playwright',
  outputDir: './test-results',
  reporter: [['line'], ['html', { outputFolder: 'playwright-report', open: 'never' }]],
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: process.env.DEMO_SCREENSHOT_BASE_URL ?? 'http://127.0.0.1:8099',
    browserName: 'chromium',
    locale: 'fr-FR',
    timezoneId: 'Europe/Paris',
    colorScheme: 'light',
    deviceScaleFactor: 1,
    reducedMotion: 'reduce',
    viewport: { width: 1440, height: 1000 },
    screenshot: 'off',
  },
})
