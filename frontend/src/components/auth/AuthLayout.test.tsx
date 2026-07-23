import { fireEvent, render, screen } from '@testing-library/react'
import { Mail } from 'lucide-react'
import { describe, expect, it, vi } from 'vitest'

import { ThemeContext } from '../../theme/themeContext'
import { AuthCard, AuthInput, AuthLayout, AuthPasswordInput } from './AuthLayout'

describe('authentication layout', () => {
  it('renders the shared CartaVault identity and accessible form structure', () => {
    const toggleTheme = vi.fn()
    render(
      <ThemeContext.Provider value={{
        preference: 'light',
        resolvedTheme: 'light',
        setPreference: vi.fn(),
        toggleTheme,
      }}>
        <AuthLayout>
          <AuthCard title="Connexion à CartaVault" subtitle="Accédez à votre espace personnel.">
            <AuthInput label="Adresse email" icon={Mail} type="email" />
            <AuthPasswordInput label="Mot de passe" />
          </AuthCard>
        </AuthLayout>
      </ThemeContext.Provider>,
    )

    expect(screen.getByRole('complementary', { name: 'CartaVault, Espace privé' })).toBeVisible()
    expect(screen.getByRole('heading', { name: /Vos cartes.*Vos lieux.*Votre aventure/ })).toBeVisible()
    expect(screen.getByRole('heading', { name: 'Connexion à CartaVault' })).toBeVisible()
    expect(screen.getByLabelText('Adresse email')).toHaveAttribute('type', 'email')

    const password = screen.getByLabelText('Mot de passe')
    expect(password).toHaveAttribute('type', 'password')
    fireEvent.click(screen.getByRole('button', { name: 'Afficher le mot de passe' }))
    expect(password).toHaveAttribute('type', 'text')

    fireEvent.click(screen.getByRole('button', { name: 'Activer le thème sombre' }))
    expect(toggleTheme).toHaveBeenCalledOnce()
  })
})
