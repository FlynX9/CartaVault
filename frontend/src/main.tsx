import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import { AuthProvider } from './auth/AuthProvider.tsx'
import { I18nProvider } from './i18n/I18nProvider.tsx'
import { installButtonFeedback } from './ui/buttonFeedback.ts'
import { installInteractiveTitles } from './ui/interactiveTitles.ts'
import { PwaUpdatePrompt } from './components/pwa/PwaUpdatePrompt.tsx'
import { MediaUploadHost } from './components/media/MediaUploadHost.tsx'

const uninstallButtonFeedback = installButtonFeedback()
const uninstallInteractiveTitles = installInteractiveTitles()
if (import.meta.hot) import.meta.hot.dispose(() => {
  uninstallButtonFeedback()
  uninstallInteractiveTitles()
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider><I18nProvider><App /><MediaUploadHost /><PwaUpdatePrompt /></I18nProvider></AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)
