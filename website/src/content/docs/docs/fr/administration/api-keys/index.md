---
title: Gérer les fournisseurs et clés d’instance
description: Configurer les credentials partagés et leurs garde-fous.
sidebar:
  order: 50
---

<!-- GENERATED FILE — DO NOT EDIT DIRECTLY -->

## À quoi sert cette fonction ?

Une clé d’instance offre un service commun sans demander une clé personnelle à chaque utilisateur, tout en exigeant une supervision des coûts et erreurs.

:::caution
Cette page concerne l’administration de l’instance. Elle n’est accessible qu’aux administrateurs.
:::

## Avant de commencer

| | |
| --- | --- |
| **Où la trouver ?** | Administration → Clés API |
| **Accès** | Administrateur |

## Où la trouver ?

Suivez ce chemin dans l’interface : **Administration → Clés API**.


![Gérer les fournisseurs et clés d’instance — écran desktop](/docs/screenshots/admin-api-keys-fr-light.png)

*Gérer les fournisseurs et clés d’instance — écran desktop*

![Gérer les fournisseurs et clés d’instance — écran mobile](/docs/screenshots/admin-api-keys-fr-mobile.png)

*Gérer les fournisseurs et clés d’instance — écran mobile*

## Comment l’utiliser ?

1. Ajoutez ou modifiez un credential d’instance.
2. Testez sa validité sans afficher le secret.
3. Associez la clé aux services compatibles et aux quotas autorisés.

### Résultat attendu

Les secrets sont chiffrés et masqués après enregistrement.

## Comment ça fonctionne ?

- Les secrets sont chiffrés et masqués après enregistrement.
- Stadia est réservé à la recherche de lieux ; Google couvre Routes, Places et le satellite Maps JavaScript.
- OpenFreeMap est direct et sans clé ; ArcGIS utilise la clé d’instance pour une courte session navigateur.

## À savoir

:::note
- La consommation et la facturation autoritatives doivent être contrôlées chez le fournisseur.
:::

## Voir aussi

- [Gérer ses clés API personnelles](/docs/fr/account/api-keys/)
- [Préparer les fonds CartaVault Vector](/docs/fr/administration/cartavault-vector/)
- [Configurer les e-mails transactionnels](/docs/fr/self-hosting/email/)

<small>Version CartaVault : **1.0.0 stable** · ID : `admin.api-keys`</small>
