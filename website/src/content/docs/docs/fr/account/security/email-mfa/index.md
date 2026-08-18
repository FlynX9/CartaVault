---
title: Activer le code MFA par e-mail
description: Demander un code à chaque connexion lorsque TOTP n’est pas configuré.
sidebar:
  order: 70
---

<!-- GENERATED FILE — DO NOT EDIT DIRECTLY -->

## À quoi sert cette fonction ?

Le code par e-mail fournit une protection supplémentaire accessible aux comptes qui ne disposent pas encore d’application TOTP.

## Avant de commencer

| | |
| --- | --- |
| **Où la trouver ?** | Mon compte → Sécurité → Code par e-mail |
| **Accès** | Utilisateur |

## Où la trouver ?

Suivez ce chemin dans l’interface : **Mon compte → Sécurité → Code par e-mail**.


![Activer le code MFA par e-mail — écran desktop](/docs/screenshots/account-email-mfa-fr-light.png)

*Activer le code MFA par e-mail — écran desktop*

![Activer le code MFA par e-mail — écran mobile](/docs/screenshots/account-email-mfa-fr-mobile.png)

*Activer le code MFA par e-mail — écran mobile*

## Comment l’utiliser ?

1. Ouvrez Code par e-mail.
2. Saisissez le mot de passe actuel.
3. Demandez le code et validez-le selon les instructions reçues.

### Résultat attendu

Le code est à usage unique, de courte durée et limité en tentatives.

## Comment ça fonctionne ?

- Le code est à usage unique, de courte durée et limité en tentatives.
- TOTP reste activable ensuite et remplace cette méthode.
- Lorsque TOTP est actif, la carte Code par e-mail est masquée.

## À savoir

:::note
- La méthode dépend de la disponibilité du service d’e-mail de l’instance.
:::

## Voir aussi

- [Comprendre la sécurité du compte](/docs/fr/account/security/overview/)
- [Configurer l’authentification TOTP](/docs/fr/account/security/totp/)
- [Changer l’adresse e-mail](/docs/fr/account/security/email/)

<small>Version CartaVault : **master** · ID : `account.email-mfa`</small>
