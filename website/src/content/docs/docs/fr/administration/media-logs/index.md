---
title: Régler la médiathèque et les journaux
description: Limiter les images, optimiser l’existant et choisir la conservation des logs.
sidebar:
  order: 80
---

<!-- GENERATED FILE — DO NOT EDIT DIRECTLY -->

## À quoi sert cette fonction ?

L’administrateur doit maîtriser l’espace disque et disposer de diagnostics utiles sans conserver indéfiniment des données techniques.

:::caution
Cette page concerne l’administration de l’instance. Elle n’est accessible qu’aux administrateurs.
:::

## Avant de commencer

| | |
| --- | --- |
| **Où la trouver ?** | Administration → Général → Médiathèque et Journaux d’instance |
| **Accès** | Administrateur |

## Où la trouver ?

Suivez ce chemin dans l’interface : **Administration → Général → Médiathèque et Journaux d’instance**.


![Régler la médiathèque et les journaux](/docs/screenshots/admin-media-logs-fr-light.png)

*Régler la médiathèque et les journaux*

## Comment l’utiliser ?

1. Définissez taille et résolution maximales des nouveaux imports.
2. Lancez l’optimisation de l’existant si nécessaire.
3. Choisissez la durée de conservation des journaux puis enregistrez.

### Résultat attendu

Les images ne sont jamais agrandies.

## Comment ça fonctionne ?

- Les images ne sont jamais agrandies.
- L’optimisation est une tâche suivie et respecte les fichiers déjà valides.
- Les messages sont filtrés pour retirer secrets et données personnelles inutiles.

## À savoir

:::note
- Sauvegardez avant une optimisation massive de médias.
:::

## Voir aussi

- [Importer des photos et utiliser les données GPS](/docs/fr/media/upload-exif/)
- [Superviser l’état de l’instance](/docs/fr/administration/instance-status/)
- [Configurer confidentialité et conformité](/docs/fr/administration/privacy-compliance/)

<small>Version CartaVault : **master** · ID : `admin.media-logs`</small>
