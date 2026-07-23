import { accountEn } from './locales/en/account'
import { authEn } from './locales/en/auth'
import { commonEn } from './locales/en/common'
import { workspaceEn } from './locales/en/workspace'
import { accountFr } from './locales/fr/account'
import { authFr } from './locales/fr/auth'
import { commonFr } from './locales/fr/common'
import { workspaceFr } from './locales/fr/workspace'

export const frMessages = {
  ...commonFr,
  ...authFr,
  ...accountFr,
  ...workspaceFr,
} as const

export type TranslationKey = keyof typeof frMessages

export const enMessages = {
  ...commonEn,
  ...authEn,
  ...accountEn,
  ...workspaceEn,
} as const satisfies Record<TranslationKey, string>

export const messages = { fr: frMessages, en: enMessages } as const
