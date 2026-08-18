---
title: Comprendre cartes, lieux et sorties
description: Le modèle d’organisation central de CartaVault.
sidebar:
  order: 10
---

<!-- GENERATED FILE — DO NOT EDIT DIRECTLY -->

## À quoi sert cette fonction ?

CartaVault sépare l’espace durable qui classe les données, la fiche d’un lieu et l’itinéraire temporaire qui réutilise ces lieux. Cette séparation évite de dupliquer les informations lors de la préparation d’un voyage.

## Avant de commencer

| | |
| --- | --- |
| **Accès** | Public, Utilisateur |

## Illustration


![Les lieux d’une carte sont réutilisés comme étapes d’une sortie. — écran desktop](/docs/screenshots/trip-france-fr-light.png)

*Les lieux d’une carte sont réutilisés comme étapes d’une sortie. — écran desktop*

![Les lieux d’une carte sont réutilisés comme étapes d’une sortie. — écran mobile](/docs/screenshots/trip-france-fr-mobile.png)

*Les lieux d’une carte sont réutilisés comme étapes d’une sortie. — écran mobile*

## Comment l’utiliser ?

1. Créez une carte associée à un pays.
2. Ajoutez et classez les lieux dans cette carte.
3. Réutilisez les lieux comme étapes d’une ou plusieurs sorties.

### Résultat attendu

Une carte porte ses catégories, tags, statuts, membres et réglages.

## Comment ça fonctionne ?

- Une carte porte ses catégories, tags, statuts, membres et réglages.
- Un lieu reste la source de vérité même lorsqu’il est utilisé dans plusieurs journées.
- Une sortie conserve ses propres durées, ordre, nuits et itinéraires calculés.

## À savoir

:::note
- La version actuelle utilise des cartes mono-pays ; les cartes multi-pays décrites dans les issues ne sont pas disponibles.
:::

## Voir aussi

- [Parcourir le coffre de cartes](/docs/fr/maps/catalog/)
- [Parcourir et rechercher les lieux](/docs/fr/places/browse-search/)
- [Créer et organiser une sortie](/docs/fr/trips/create-plan/)

<small>Version CartaVault : **master** · ID : `concepts.data-model`</small>
