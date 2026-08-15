---
title: Comprendre la sécurité du compte
description: Contrôler e-mail, mot de passe, MFA et sessions.
sidebar:
  order: 30
---

<!-- GENERATED FILE — DO NOT EDIT DIRECTLY -->

## À quoi sert cette fonction ?

Le panneau rassemble les protections et appareils actifs pour détecter une configuration faible ou un accès inattendu.

## Avant de commencer

| | |
| --- | --- |
| **Où la trouver ?** | Menu utilisateur → Options → Sécurité |
| **Accès** | Utilisateur |

## Où la trouver ?

Suivez ce chemin dans l’interface : **Menu utilisateur → Options → Sécurité**.


![Comprendre la sécurité du compte](/docs/screenshots/account-security-fr-light.png)

*Comprendre la sécurité du compte*

## Comment l’utiliser ?

1. Vérifiez les quatre indicateurs de résumé.
2. Choisissez une méthode MFA si nécessaire.
3. Contrôlez les sessions et utilisez les actions sensibles dans leur dialogue dédié.

### Résultat attendu

Une seule méthode MFA est active : TOTP remplace le code e-mail.

## Comment ça fonctionne ?

- Une seule méthode MFA est active : TOTP remplace le code e-mail.
- Le statut MFA est renforcé avec TOTP et actif avec e-mail.
- Les opérations sensibles redemandent le mot de passe ou un facteur.

## À savoir

:::note
- Privilégiez TOTP et conservez les codes de récupération hors de CartaVault.
:::

## Voir aussi

- [Changer l’adresse e-mail](/docs/fr/account/security/email/)
- [Changer le mot de passe](/docs/fr/account/security/password/)
- [Configurer l’authentification TOTP](/docs/fr/account/security/totp/)
- [Activer le code MFA par e-mail](/docs/fr/account/security/email-mfa/)
- [Gérer les sessions et appareils](/docs/fr/account/security/sessions/)

<small>Version CartaVault : **master** · ID : `account.security`</small>
