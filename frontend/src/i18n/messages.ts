import { accountEn } from './locales/en/account'
import { authEn } from './locales/en/auth'
import { commonEn } from './locales/en/common'
import { dashboardEn } from './locales/en/dashboard'
import { workspaceEn } from './locales/en/workspace'
import { accountFr } from './locales/fr/account'
import { authFr } from './locales/fr/auth'
import { commonFr } from './locales/fr/common'
import { dashboardFr } from './locales/fr/dashboard'
import { workspaceFr } from './locales/fr/workspace'

export const frMessages = {
  ...commonFr,
  ...authFr,
  ...accountFr,
  ...workspaceFr,
  ...dashboardFr,
} as const

export type TranslationKey = keyof typeof frMessages

export const enMessages = {
  ...commonEn,
  ...authEn,
  ...accountEn,
  ...workspaceEn,
  ...dashboardEn,
} as const satisfies Record<TranslationKey, string>

export const messages = { fr: frMessages, en: enMessages } as const
