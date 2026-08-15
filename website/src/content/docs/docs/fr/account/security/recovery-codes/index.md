---
title: Conserver les codes de récupération
description: Récupérer l’accès lorsque l’application TOTP est indisponible.
sidebar:
  order: 80
---

<!-- GENERATED FILE — DO NOT EDIT DIRECTLY -->

## À quoi sert cette fonction ?

Les codes de récupération évitent qu’une perte ou panne du téléphone bloque définitivement le compte.

## Avant de commencer

| | |
| --- | --- |
| **Où la trouver ?** | Mon compte → Sécurité → Application TOTP → Codes de récupération |
| **Accès** | Utilisateur |

## Où la trouver ?

Suivez ce chemin dans l’interface : **Mon compte → Sécurité → Application TOTP → Codes de récupération**.


![Conserver les codes de récupération](/docs/screenshots/account-recovery-codes-fr-light.png)

*Conserver les codes de récupération*

## Comment l’utiliser ?

1. Copiez ou téléchargez les codes lors de l’activation.
2. Stockez-les dans un emplacement sûr distinct de CartaVault.
3. Régénérez-les si vous soupçonnez une exposition.

### Résultat attendu

Chaque code ne fonctionne qu’une fois.

## Comment ça fonctionne ?

- Chaque code ne fonctionne qu’une fois.
- Seuls des condensats sont conservés par le serveur.
- La régénération invalide tous les anciens codes.

## À savoir

:::note
- Les codes ne sont affichés en clair qu’au moment de leur création.
:::

## Voir aussi

- [Configurer l’authentification TOTP](/docs/fr/account/security/totp/)
- [Comprendre la sécurité du compte](/docs/fr/account/security/overview/)

<small>Version CartaVault : **master** · ID : `account.recovery-codes`</small>
