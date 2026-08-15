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


![Gérer les fournisseurs et clés d’instance](/docs/screenshots/admin-api-keys-fr-light.png)

*Gérer les fournisseurs et clés d’instance*

## Comment l’utiliser ?

1. Ajoutez ou modifiez un credential d’instance.
2. Testez sa validité sans afficher le secret.
3. Configurez les services et seuils compatibles.

### Résultat attendu

Les secrets sont chiffrés et masqués après enregistrement.

## Comment ça fonctionne ?

- Les secrets sont chiffrés et masqués après enregistrement.
- Les diagnostics nettoyés indiquent fournisseur, statut et erreur utile.
- Une clé personnelle peut rester prioritaire selon la préférence du compte.

## À savoir

:::note
- Les compteurs client sont indicatifs ; une facturation autoritative doit être contrôlée chez le fournisseur.
:::

## Voir aussi

- [Gérer ses clés API personnelles](/docs/fr/account/api-keys/)
- [Préparer les fonds CartaVault Vector](/docs/fr/administration/cartavault-vector/)
- [Configurer les e-mails transactionnels](/docs/fr/self-hosting/email/)

<small>Version CartaVault : **master** · ID : `admin.api-keys`</small>
