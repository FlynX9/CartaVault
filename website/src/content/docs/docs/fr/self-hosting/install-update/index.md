---
title: Installer et mettre à jour CartaVault
description: Déployer l’image unifiée avec PostGIS et terminer l’assistant initial.
sidebar:
  order: 10
---

<!-- GENERATED FILE — DO NOT EDIT DIRECTLY -->

## À quoi sert cette fonction ?

L’image unifiée limite le déploiement standard à CartaVault et PostgreSQL/PostGIS tout en gardant migrations et frontend sur la même version.

## Avant de commencer

| | |
| --- | --- |
| **Où la trouver ?** | Serveur Docker → compose officiel → assistant de configuration |
| **Accès** | instance-operator |

## Où la trouver ?

Suivez ce chemin dans l’interface : **Serveur Docker → compose officiel → assistant de configuration**.


![Installer et mettre à jour CartaVault](/docs/screenshots/login-fr-light.png)

*Installer et mettre à jour CartaVault*

## Comment l’utiliser ?

1. Configurez les variables et volumes persistants.
2. Démarrez PostGIS et CartaVault, puis ouvrez l’assistant initial.
3. Créez le premier administrateur et vérifiez l’état de l’instance.

### Résultat attendu

Les migrations s’appliquent au démarrage avant disponibilité.

## Comment ça fonctionne ?

- Les migrations s’appliquent au démarrage avant disponibilité.
- Le conteneur s’exécute sans privilèges avec un système de fichiers applicatif en lecture seule.
- La documentation embarquée correspond au build de l’image.

## À savoir

:::note
- Exposez une instance Internet uniquement derrière HTTPS et un reverse proxy correctement configuré.
:::

## Voir aussi

- [Superviser l’état de l’instance](/docs/fr/administration/instance-status/)
- [Configurer les e-mails transactionnels](/docs/fr/self-hosting/email/)
- [Utiliser CartaVault sans réseau](/docs/fr/offline/pwa-navigation/)

<small>Version CartaVault : **master** · ID : `deployment.install`</small>
