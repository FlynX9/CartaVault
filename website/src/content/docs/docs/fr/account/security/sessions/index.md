---
title: Gérer les sessions et appareils
description: Identifier et révoquer les connexions au compte.
sidebar:
  order: 90
---

<!-- GENERATED FILE — DO NOT EDIT DIRECTLY -->

## À quoi sert cette fonction ?

La liste des sessions aide à repérer un appareil inattendu et à couper son accès sans changer immédiatement toutes les données du compte.

## Avant de commencer

| | |
| --- | --- |
| **Où la trouver ?** | Mon compte → Sécurité → Gérer les sessions |
| **Accès** | Utilisateur |

## Où la trouver ?

Suivez ce chemin dans l’interface : **Mon compte → Sécurité → Gérer les sessions**.


![Gérer les sessions et appareils](/docs/screenshots/account-sessions-fr-light.png)

*Gérer les sessions et appareils*

## Comment l’utiliser ?

1. Identifiez l’appareil courant grâce au label Actuel.
2. Contrôlez appareil, navigateur, localisation disponible et dernière activité.
3. Révoquez une session précise ou toutes les autres.

### Résultat attendu

L’identification du navigateur dépend du user-agent et peut rester générique.

## Comment ça fonctionne ?

- L’identification du navigateur dépend du user-agent et peut rester générique.
- La localisation n’est affichée que lorsqu’elle est disponible sans exposer une position précise.
- Une session révoquée doit se reconnecter à sa prochaine requête protégée.

## À savoir

:::note
- Un navigateur basé sur Chromium peut être identifié comme Chrome si aucune signature fiable ne permet de distinguer Brave.
:::

## Voir aussi

- [Comprendre la sécurité du compte](/docs/fr/account/security/overview/)
- [Changer le mot de passe](/docs/fr/account/security/password/)

<small>Version CartaVault : **master** · ID : `account.sessions`</small>
