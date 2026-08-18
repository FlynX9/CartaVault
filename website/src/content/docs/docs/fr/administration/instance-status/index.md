---
title: Superviser l’état de l’instance
description: Contrôler versions, base, stockage, services, ressources et journaux.
sidebar:
  order: 90
---

<!-- GENERATED FILE — DO NOT EDIT DIRECTLY -->

## À quoi sert cette fonction ?

Le diagnostic aide à comprendre une panne ou une saturation sans ouvrir une session SSH sur le serveur.

:::caution
Cette page concerne l’administration de l’instance. Elle n’est accessible qu’aux administrateurs.
:::

## Avant de commencer

| | |
| --- | --- |
| **Où la trouver ?** | Administration → État de l’instance |
| **Accès** | Administrateur |

## Où la trouver ?

Suivez ce chemin dans l’interface : **Administration → État de l’instance**.


![Superviser l’état de l’instance — écran desktop](/docs/screenshots/admin-instance-fr-light.png)

*Superviser l’état de l’instance — écran desktop*

![Superviser l’état de l’instance — écran mobile](/docs/screenshots/admin-instance-fr-mobile.png)

*Superviser l’état de l’instance — écran mobile*

## Comment l’utiliser ?

1. Actualisez le diagnostic.
2. Contrôlez résumé, services, ressources et versions.
3. Filtrez les journaux récents et utilisez les détails pour corréler un incident.

### Résultat attendu

Chaque contrôle a son propre état : une panne externe ne masque pas les autres services.

## Comment ça fonctionne ?

- Chaque contrôle a son propre état : une panne externe ne masque pas les autres services.
- Les valeurs sensibles sont absentes des réponses.
- La version, la révision Alembic et l’état PostGIS facilitent le support.

## À savoir

:::note
- Ce panneau complète les métriques de l’hébergeur ; il ne remplace pas sauvegardes et surveillance externe.
:::

## Voir aussi

- [Configurer l’instance](/docs/fr/administration/general/)
- [Régler la médiathèque et les journaux](/docs/fr/administration/media-logs/)
- [Installer et mettre à jour CartaVault](/docs/fr/self-hosting/install-update/)

<small>Version CartaVault : **master** · ID : `admin.instance`</small>
