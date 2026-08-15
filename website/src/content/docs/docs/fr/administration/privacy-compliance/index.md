---
title: Configurer confidentialité et conformité
description: Publier l’opérateur, les politiques, le consentement et les conservations.
sidebar:
  order: 70
---

<!-- GENERATED FILE — DO NOT EDIT DIRECTLY -->

## À quoi sert cette fonction ?

Ces réglages rendent explicites les responsabilités de l’instance et adaptent le consentement aux services réellement activés.

:::caution
Cette page concerne l’administration de l’instance. Elle n’est accessible qu’aux administrateurs.
:::

## Avant de commencer

| | |
| --- | --- |
| **Où la trouver ?** | Administration → Général → Confidentialité et conformité |
| **Accès** | Administrateur |

## Où la trouver ?

Suivez ce chemin dans l’interface : **Administration → Général → Confidentialité et conformité**.


![Configurer confidentialité et conformité](/docs/screenshots/admin-privacy-fr-light.png)

*Configurer confidentialité et conformité*

## Comment l’utiliser ?

1. Activez la rubrique si elle s’applique à l’instance.
2. Choisissez Respectueux de la vie privée ou Consentement requis.
3. Renseignez opérateur, contact, URL des politiques et durées, puis enregistrez.

### Résultat attendu

Le mode respectueux n’affiche pas de bannière tant qu’aucun service optionnel ne collecte de données.

## Comment ça fonctionne ?

- Le mode respectueux n’affiche pas de bannière tant qu’aucun service optionnel ne collecte de données.
- Le mode Consentement requis affiche la bannière pour les fonctionnalités concernées.
- Les journaux et sessions antérieurs aux durées sont automatiquement purgés.

## À savoir

:::note
- Le contact doit être une adresse e-mail valide et les URL doivent utiliser HTTP ou HTTPS selon la validation serveur.
:::

## Voir aussi

- [Gérer confidentialité et export personnel](/docs/fr/account/privacy/)
- [Configurer l’instance](/docs/fr/administration/general/)
- [Superviser l’état de l’instance](/docs/fr/administration/instance-status/)

<small>Version CartaVault : **master** · ID : `admin.privacy`</small>
