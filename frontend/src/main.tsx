import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import '@fontsource/manrope/latin-400.css'
import '@fontsource/manrope/latin-500.css'
import '@fontsource/manrope/latin-600.css'
import '@fontsource/manrope/latin-700.css'
import '@fontsource/manrope/latin-800.css'
import './index.css'
import './desktop-navigation.css'
import './mobile-navigation.css'
import './trip-stop-search.css'
import App from './App.tsx'
import { AuthProvider } from './auth/AuthProvider.tsx'
import { I18nProvider } from './i18n/I18nProvider.tsx'
import { installButtonFeedback } from './ui/buttonFeedback.ts'
import { installInteractiveTitles } from './ui/interactiveTitles.ts'
import { PwaUpdatePrompt } from './components/pwa/PwaUpdatePrompt.tsx'
import { MediaUploadHost } from './components/media/MediaUploadHost.tsx'
import { GlobalFeedbackToasts } from './components/common/GlobalFeedbackToasts.tsx'
import { applyTheme, loadThemePreference, resolveTheme } from './theme/theme.ts'

// Apply the locally known preference before React paints to avoid a light-to-dark flash.
try {
  applyTheme(resolveTheme(loadThemePreference(window.localStorage)))
} catch {
  applyTheme(resolveTheme('system'))
}

const uninstallButtonFeedback = installButtonFeedback()
const uninstallInteractiveTitles = installInteractiveTitles()
if (import.meta.hot) import.meta.hot.dispose(() => {
  uninstallButtonFeedback()
  uninstallInteractiveTitles()
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider><I18nProvider><App /><MediaUploadHost /><PwaUpdatePrompt /><GlobalFeedbackToasts /></I18nProvider></AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)
