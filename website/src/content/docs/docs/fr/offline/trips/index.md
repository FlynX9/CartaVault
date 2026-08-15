---
title: Préparer une sortie hors ligne
description: Conserver étapes, nuits, tracés et fond cartographique avant le départ.
sidebar:
  order: 30
---

<!-- GENERATED FILE — DO NOT EDIT DIRECTLY -->

## À quoi sert cette fonction ?

Une sortie doit rester consultable lorsque la connexion mobile est absente ou instable.

## Avant de commencer

| | |
| --- | --- |
| **Où la trouver ?** | Sorties → action Rendre disponible hors ligne |
| **Accès** | Utilisateur, Lecteur |

## Où la trouver ?

Suivez ce chemin dans l’interface : **Sorties → action Rendre disponible hors ligne**.


![Préparer une sortie hors ligne](/docs/screenshots/trip-offline-fr-light.png)

*Préparer une sortie hors ligne*

## Comment l’utiliser ?

1. Calculez les itinéraires nécessaires avant le téléchargement.
2. Ouvrez Rendre disponible hors ligne et vérifiez le contenu.
3. Laissez le téléchargement se terminer, puis contrôlez-le dans Mon compte.

### Résultat attendu

Le package reprend les données de la sortie et de sa carte, les tracés enregistrés et, si disponible, les tuiles CartaVault Vector.

## Comment ça fonctionne ?

- Le package reprend les données de la sortie et de sa carte, les tracés enregistrés et, si disponible, les tuiles CartaVault Vector.
- Le téléchargement continue via le gestionnaire tant que la page/PWA reste active.
- Les modifications et nouveaux calculs restent indisponibles hors ligne.

## À savoir

:::note
- Un rechargement ne peut reprendre que les tâches dont l’état a été persisté par le navigateur.
:::

## Voir aussi

- [Préparer une carte hors ligne](/docs/fr/offline/maps/)
- [Gérer les données hors ligne](/docs/fr/account/offline-data/)
- [Créer et organiser une sortie](/docs/fr/trips/create-plan/)

<small>Version CartaVault : **master** · ID : `trips.offline`</small>
