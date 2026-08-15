---
title: Préparer les fonds CartaVault Vector
description: Télécharger les extraits OSM et générer les fonds vectoriels par pays.
sidebar:
  order: 60
---

<!-- GENERATED FILE — DO NOT EDIT DIRECTLY -->

## À quoi sert cette fonction ?

Le fond CartaVault fournit une cartographie cohérente servie par l’instance et réutilisable hors ligne, sans dépendre des conditions de cache d’un fournisseur tiers.

:::caution
Cette page concerne l’administration de l’instance. Elle n’est accessible qu’aux administrateurs.
:::

## Avant de commencer

| | |
| --- | --- |
| **Où la trouver ?** | Administration → Général → Fond de carte CartaVault |
| **Accès** | Administrateur |

## Où la trouver ?

Suivez ce chemin dans l’interface : **Administration → Général → Fond de carte CartaVault**.


![Préparer les fonds CartaVault Vector](/docs/screenshots/admin-vector-fr-light.png)

*Préparer les fonds CartaVault Vector*

## Comment l’utiliser ?

1. Activez CartaVault Vector et choisissez la stratégie de préparation.
2. Sélectionnez un pays pris en charge puis lancez Télécharger et préparer.
3. Suivez les phases et le pourcentage ; mettez à jour, réessayez ou supprimez le fond.

### Résultat attendu

Geofabrik fournit l’extrait contrôlé et Planetiler ne s’exécute que pendant la génération.

## Comment ça fonctionne ?

- Geofabrik fournit l’extrait contrôlé et Planetiler ne s’exécute que pendant la génération.
- Un seul fond est généré à la fois et la tâche persiste côté serveur.
- Les utilisateurs téléchargent ensuite les tuiles depuis ce fond déjà construit ; l’extrait source n’est pas régénéré par appareil.

## À savoir

:::note
- Le stockage et le temps de génération varient fortement selon le pays et les zooms.
:::

## Voir aussi

- [Préparer une carte hors ligne](/docs/fr/offline/maps/)
- [Gérer les données hors ligne](/docs/fr/account/offline-data/)
- [Configurer l’instance](/docs/fr/administration/general/)

<small>Version CartaVault : **master** · ID : `admin.vector-basemaps`</small>
