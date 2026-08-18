---
title: Configurer l’authentification TOTP
description: Renforcer la connexion avec une application d’authentification.
sidebar:
  order: 60
---

<!-- GENERATED FILE — DO NOT EDIT DIRECTLY -->

## À quoi sert cette fonction ?

TOTP ajoute un code temporaire généré sur un appareil séparé et résiste mieux qu’un second facteur reçu dans la même boîte e-mail.

## Avant de commencer

| | |
| --- | --- |
| **Où la trouver ?** | Mon compte → Sécurité → Application d’authentification (TOTP) |
| **Accès** | Utilisateur |

## Où la trouver ?

Suivez ce chemin dans l’interface : **Mon compte → Sécurité → Application d’authentification (TOTP)**.


![Configurer l’authentification TOTP — écran desktop](/docs/screenshots/account-totp-fr-light.png)

*Configurer l’authentification TOTP — écran desktop*

![Configurer l’authentification TOTP — écran mobile](/docs/screenshots/account-totp-fr-mobile.png)

*Configurer l’authentification TOTP — écran mobile*

## Comment l’utiliser ?

1. Confirmez votre mot de passe si demandé.
2. Scannez le QR code ou copiez la clé dans l’application.
3. Saisissez le code à six chiffres puis conservez les codes de récupération.

### Résultat attendu

Le secret est chiffré sur le serveur et n’est plus renvoyé après activation.

## Comment ça fonctionne ?

- Le secret est chiffré sur le serveur et n’est plus renvoyé après activation.
- Aucune activation n’a lieu avant validation d’un premier code.
- Activer TOTP désactive le code par e-mail : les méthodes ne se cumulent pas.

## À savoir

:::note
- Conservez l’horloge de l’appareil à l’heure et stockez les codes de récupération hors ligne.
:::

## Voir aussi

- [Comprendre la sécurité du compte](/docs/fr/account/security/overview/)
- [Conserver les codes de récupération](/docs/fr/account/security/recovery-codes/)
- [Activer le code MFA par e-mail](/docs/fr/account/security/email-mfa/)

<small>Version CartaVault : **master** · ID : `account.totp`</small>
