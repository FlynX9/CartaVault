---
title: Utiliser CartaVault sans réseau
description: Comprendre le shell PWA, les écrans disponibles et les limites.
sidebar:
  order: 20
---

<!-- GENERATED FILE — DO NOT EDIT DIRECTLY -->

## À quoi sert cette fonction ?

Le précache de l’application permet de rouvrir l’interface et les menus, tandis que les packages privés fournissent les cartes et sorties choisies.

## Avant de commencer

| | |
| --- | --- |
| **Où la trouver ?** | Application installée ou instance servie en HTTPS |
| **Accès** | Utilisateur |

## Où la trouver ?

Suivez ce chemin dans l’interface : **Application installée ou instance servie en HTTPS**.


![Utiliser CartaVault sans réseau — écran desktop](/docs/screenshots/places-france-fr-light.png)

*Utiliser CartaVault sans réseau — écran desktop*

![Utiliser CartaVault sans réseau — écran mobile](/docs/screenshots/places-france-fr-mobile.png)

*Utiliser CartaVault sans réseau — écran mobile*

## Comment l’utiliser ?

1. Ouvrez CartaVault en ligne au moins une fois après chaque mise à jour.
2. Préparez les cartes ou sorties nécessaires.
3. Testez l’ouverture en mode hors ligne avant le départ.

### Résultat attendu

Le service worker met en cache le build exact de l’application.

## Comment ça fonctionne ?

- Le service worker met en cache le build exact de l’application.
- Les données privées restent séparées par compte dans IndexedDB.
- Le navigateur peut purger le stockage selon sa politique ; CartaVault affiche l’espace estimé.

## À savoir

:::note
- Un contexte sécurisé HTTPS est requis en production ; une adresse LAN HTTP sur mobile n’active pas toujours le service worker.
:::

## Voir aussi

- [Préparer une carte hors ligne](/docs/fr/offline/maps/)
- [Préparer une sortie hors ligne](/docs/fr/offline/trips/)
- [Gérer les données hors ligne](/docs/fr/account/offline-data/)

<small>Version CartaVault : **master** · ID : `offline.pwa-shell`</small>
