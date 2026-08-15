---
title: Calculer et optimiser les itinéraires
description: Calculer les trajets d’une journée avec le fournisseur disponible.
sidebar:
  order: 20
---

<!-- GENERATED FILE — DO NOT EDIT DIRECTLY -->

## À quoi sert cette fonction ?

Le calcul rend visibles distance, durée et heure d’arrivée ; l’optimisation propose un ordre plus efficace sans écraser silencieusement le programme.

## Avant de commencer

| | |
| --- | --- |
| **Où la trouver ?** | Sorties → journée → Itinéraire ou Optimiser |
| **Accès** | Propriétaire de carte, Éditeur |

## Où la trouver ?

Suivez ce chemin dans l’interface : **Sorties → journée → Itinéraire ou Optimiser**.


![Calculer et optimiser les itinéraires](/docs/screenshots/trip-routing-fr-light.png)

*Calculer et optimiser les itinéraires*

## Comment l’utiliser ?

1. Vérifiez que la journée contient les emplacements nécessaires.
2. Lancez le calcul de la journée ou de toute la sortie.
3. Prévisualisez une proposition d’optimisation puis acceptez-la ou annulez-la.

### Résultat attendu

OSRM reste le moteur sans clé ; Google Routes et ORS dépendent des clés et préférences configurées.

## Comment ça fonctionne ?

- OSRM reste le moteur sans clé ; Google Routes et ORS dépendent des clés et préférences configurées.
- Une modification d’étape rend l’itinéraire à recalculer.
- L’optimisation ne s’applique qu’après confirmation.

## À savoir

:::note
- Le calcul et l’optimisation nécessitent une connexion ; seuls les tracés déjà calculés restent disponibles hors ligne.
:::

## Voir aussi

- [Créer et organiser une sortie](/docs/fr/trips/create-plan/)
- [Gérer ses clés API personnelles](/docs/fr/account/api-keys/)
- [Gérer les fournisseurs et clés d’instance](/docs/fr/administration/api-keys/)

<small>Version CartaVault : **master** · ID : `trips.routing`</small>
