---
title: Configurer les profils de quotas
description: Définir et affecter des limites sans supprimer les données existantes.
sidebar:
  order: 40
---

<!-- GENERATED FILE — DO NOT EDIT DIRECTLY -->

## À quoi sert cette fonction ?

Les profils répartissent équitablement stockage et capacité sur une instance partagée tout en gardant les règles compréhensibles.

:::caution
Cette page concerne l’administration de l’instance. Elle n’est accessible qu’aux administrateurs.
:::

## Avant de commencer

| | |
| --- | --- |
| **Où la trouver ?** | Administration → Quotas |
| **Accès** | Administrateur |

## Où la trouver ?

Suivez ce chemin dans l’interface : **Administration → Quotas**.


![Configurer les profils de quotas — écran desktop](/docs/screenshots/admin-quotas-fr-light.png)

*Configurer les profils de quotas — écran desktop*

![Configurer les profils de quotas — écran mobile](/docs/screenshots/admin-quotas-fr-mobile.png)

*Configurer les profils de quotas — écran mobile*

![Configurer les profils de quotas — écran desktop](/docs/screenshots/admin-quota-edit-fr-light.png)

*Configurer les profils de quotas — écran desktop*

![Configurer les profils de quotas — écran mobile](/docs/screenshots/admin-quota-edit-fr-mobile.png)

*Configurer les profils de quotas — écran mobile*

## Comment l’utiliser ?

1. Créez ou dupliquez un profil.
2. Définissez les limites et services associés, puis enregistrez.
3. Affectez le profil depuis Utilisateurs ou définissez-le par défaut.

### Résultat attendu

Illimité est distinct de zéro : zéro bloque une nouvelle création.

## Comment ça fonctionne ?

- Illimité est distinct de zéro : zéro bloque une nouvelle création.
- Un dépassement conserve les données existantes mais bloque les nouvelles opérations concernées.
- Le profil système illimité et les profils affectés sont protégés contre une suppression incohérente.

## À savoir

:::note
- La modification d’un quota utilisateur est un dialogue imbriqué prioritaire au-dessus de la console.
:::

## Voir aussi

- [Administrer les utilisateurs](/docs/fr/administration/users/)
- [Configurer l’instance](/docs/fr/administration/general/)

<small>Version CartaVault : **master** · ID : `admin.quotas`</small>
