import { afterEach, describe, expect, it } from 'vitest'

import { installInteractiveTitles, interactiveTitle } from './interactiveTitles'

describe('global interactive titles', () => {
  afterEach(() => document.body.replaceChildren())

  it('derives titles from accessible names and associated field labels', () => {
    document.body.innerHTML = '<button aria-label="Fermer"><svg /></button><label for="name">Nom du lieu</label><input id="name">'
    const button = document.querySelector('button')!
    const input = document.querySelector('input')!

    expect(interactiveTitle(button)).toBe('Fermer')
    expect(interactiveTitle(input)).toBe('Nom du lieu')
  })

  it('preserves explicit titles and fills visible text or placeholders', () => {
    document.body.innerHTML = '<button title="Action personnalisée">Modifier</button><button>Annuler</button><input placeholder="Rechercher un lieu">'
    const uninstall = installInteractiveTitles()
    const [explicit, textButton] = document.querySelectorAll('button')
    const input = document.querySelector('input')!

    expect(explicit).toHaveAttribute('title', 'Action personnalisée')
    expect(textButton).toHaveAttribute('title', 'Annuler')
    expect(input).toHaveAttribute('title', 'Rechercher un lieu')
    uninstall()
    expect(explicit).toHaveAttribute('title', 'Action personnalisée')
    expect(textButton).not.toHaveAttribute('title')
  })

  it('covers dynamically inserted controls and refreshed accessible labels', async () => {
    const uninstall = installInteractiveTitles()
    const button = document.createElement('button')
    button.ariaLabel = 'Ouvrir les options'
    document.body.append(button)
    await Promise.resolve()
    expect(button).toHaveAttribute('title', 'Ouvrir les options')

    button.ariaLabel = 'Fermer les options'
    await Promise.resolve()
    expect(button).toHaveAttribute('title', 'Fermer les options')
    uninstall()
  })

  it('refreshes titles when visible or referenced label text changes', async () => {
    document.body.innerHTML = '<span id="action-label">Ouvrir</span><button aria-labelledby="action-label"><svg /></button><button>Ajouter</button>'
    const uninstall = installInteractiveTitles()
    const label = document.querySelector('span')!
    const [labelledButton, textButton] = document.querySelectorAll('button')

    label.firstChild!.textContent = 'Fermer'
    textButton.firstChild!.textContent = 'Retirer'
    await Promise.resolve()

    expect(labelledButton).toHaveAttribute('title', 'Fermer')
    expect(textButton).toHaveAttribute('title', 'Retirer')
    uninstall()
  })

  it('uses the selected option when a select has no associated label', () => {
    document.body.innerHTML = '<select><option>Premier choix</option><option selected>Deuxième choix</option></select>'

    expect(interactiveTitle(document.querySelector('select')!)).toBe('Deuxième choix')
  })
})
