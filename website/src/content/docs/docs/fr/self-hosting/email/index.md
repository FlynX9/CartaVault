---
title: Configurer les e-mails transactionnels
description: Activer vérification, récupération, invitations, alertes et MFA e-mail.
sidebar:
  order: 20
---

<!-- GENERATED FILE — DO NOT EDIT DIRECTLY -->

## À quoi sert cette fonction ?

Les parcours de sécurité et collaboration doivent prévenir l’utilisateur et vérifier l’adresse sans dépendre d’une intervention manuelle.

## Avant de commencer

| | |
| --- | --- |
| **Où la trouver ?** | Variables de déploiement pour SMTP, ou Administration → Clés API pour Resend |
| **Accès** | instance-operator, Administrateur |

## Où la trouver ?

Suivez ce chemin dans l’interface : **Variables de déploiement pour SMTP, ou Administration → Clés API pour Resend**.


![Configurer les e-mails transactionnels — écran desktop](/docs/screenshots/admin-api-keys-fr-light.png)

*Configurer les e-mails transactionnels — écran desktop*

![Configurer les e-mails transactionnels — écran mobile](/docs/screenshots/admin-api-keys-fr-mobile.png)

*Configurer les e-mails transactionnels — écran mobile*

## Comment l’utiliser ?

1. Choisissez SMTP, Resend ou aucun transport.
2. Configurez l’expéditeur et le secret hors du code source.
3. Testez les parcours de vérification, récupération et MFA.

### Résultat attendu

Les envois utilisent des modèles de marque FR/EN.

## Comment ça fonctionne ?

- Les envois utilisent des modèles de marque FR/EN.
- Les codes et secrets ne sont jamais écrits dans les journaux.
- Les erreurs sont réessayées selon la politique du transport.

## À savoir

:::note
- Sans transport, les fonctions dépendantes restent limitées et doivent l’indiquer clairement.
:::

## Voir aussi

- [Gérer les inscriptions publiques](/docs/fr/administration/public-registration/)
- [Activer le code MFA par e-mail](/docs/fr/account/security/email-mfa/)
- [Gérer les fournisseurs et clés d’instance](/docs/fr/administration/api-keys/)

<small>Version CartaVault : **master** · ID : `deployment.email`</small>
