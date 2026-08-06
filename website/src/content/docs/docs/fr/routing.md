---
title: Routage et optimisation
description: Configurer un moteur, calculer les journées et comprendre les propositions d’optimisation.
sidebar:
  order: 8
---

## Choisir le moteur de routage

Dans **Profil > Préférences > Routage**, choisissez le fournisseur disponible :

- **OSRM** fonctionne sans clé personnelle et calcule les routes routières ;
- **Google Routes** nécessite une clé API personnelle vérifiée et donne accès aux options Google prises en charge.

Une clé Google Routes est chiffrée dans la base de données. L’interface n’affiche ensuite qu’une valeur masquée et son état de vérification. Vous pouvez la remplacer, la vérifier ou la supprimer après confirmation de votre mot de passe.

## Contraintes de trajet

Selon le fournisseur, vous pouvez demander de rester dans le pays, éviter les péages, les autoroutes ou les ferries, et choisir le niveau de prise en compte du trafic. Une contrainte peut rendre un segment impossible ; CartaVault conserve alors l’avertissement au lieu d’inventer une route.

## Calculer les itinéraires

Le bouton **Calculer les itinéraires** traite les journées qui possèdent suffisamment de points. Pour chaque journée, les ancres sont :

- le départ du voyage ou la nuit précédente ;
- les étapes du jour dans leur ordre ;
- la nuit suivante ou l’arrivée du voyage.

Le résultat met à jour la géométrie, la distance et le temps de route. Les temps de visite sont ajoutés séparément pour produire le temps total de la journée.

Une modification d’étape, d’ordre ou d’ancre marque l’itinéraire comme à recalculer. L’ancien tracé n’est pas présenté comme actuel.

## Optimiser une journée

**Optimiser** propose un nouvel ordre pour les étapes de la journée tout en conservant ses points de départ et d’arrivée. La proposition affiche les valeurs avant/après et le gain estimé. Rien n’est modifié tant que vous ne choisissez pas **Appliquer l’optimisation**.

## Optimiser le voyage

L’optimisation globale calcule une proposition pour toutes les journées éligibles. Elle réutilise les routes déjà calculées quand elles sont encore valides et limite les requêtes au fournisseur. Si le voyage change entre la proposition et sa validation, le serveur refuse l’application afin de ne pas écraser vos modifications.

## Limites, cache et temporisation

CartaVault limite les rafales de requêtes et applique une temporisation après une réponse de quota. Les résultats réutilisables sont mis en cache. Un message demandant de réessayer plus tard indique généralement un quota fournisseur atteint, une clé mal configurée ou une accumulation de calculs rapprochés.

## Lire les indicateurs

- **Distance** : longueur routée, pas distance à vol d’oiseau.
- **Route** : durée de conduite calculée par le fournisseur.
- **Visites** : somme des durées prévues sur les étapes.
- **Total** : route et visites cumulées selon le récapitulatif affiché.
- **Non calculé / à recalculer** : données absentes ou rendues obsolètes par une modification.

Pour la composition des journées, consultez [Sorties et journées](/docs/fr/trips/).
