---
title: Organisation et recherche
description: Classer les lieux, combiner les filtres et exploiter la recherche cartographique.
sidebar:
  order: 4
---

## Catégories

Les catégories décrivent la nature d’un lieu : architecture, musée, nature, hébergement, gastronomie, etc. Un lieu peut recevoir plusieurs catégories et l’une d’elles devient la catégorie principale affichée dans la liste et sur sa fiche.

Le panneau **Catégories** permet de créer, renommer, illustrer et supprimer les catégories non protégées. La catégorie **Importé** est réservée aux imports et ne peut pas être supprimée. Avant de retirer une autre catégorie, vérifiez les lieux qui l’utilisent.

## Statuts

Les statuts décrivent l’état de suivi du lieu, par exemple *À découvrir*, *Planifié*, *Visité* ou *À vérifier*. Chaque statut possède un nom, une couleur, un ordre et un état fonctionnel. Cet état permet à CartaVault de calculer correctement les compteurs visités/non visités même si vous personnalisez les libellés.

Les couleurs sont reprises dans les marqueurs, les listes et le tableau de bord. Réordonnez les statuts par glisser-déposer dans le panneau dédié.

## Tags

Les tags servent à créer une classification libre et transversale : priorité, saison, groupe, thème ou toute convention propre à votre organisation. Ils complètent les catégories sans les remplacer. Utilisez des noms courts et cohérents pour préserver la qualité des facettes.

## Recherche dans la liste

Le champ du panneau **Lieux** recherche dans les informations indexées du lieu. Les filtres rapides isolent tous les lieux, les lieux visités, non visités ou favoris. Le panneau **Filtres** permet ensuite de combiner statuts, catégories, tags et autres facettes disponibles.

Le tri est une préférence persistante. **Réinitialiser les filtres** remet uniquement les filtres à zéro et conserve le tri choisi. Pour changer l’ordre, utilisez explicitement le sélecteur de tri.

Les grandes listes sont virtualisées : seuls les éléments visibles sont rendus. Le résultat et la position restent cohérents lorsque vous ouvrez une fiche puis revenez à la liste.

## Sélection et actions groupées

Activez le mode de sélection pour choisir plusieurs lieux. Les actions groupées disponibles dépendent de vos droits et permettent notamment d’appliquer un statut, une catégorie ou un tag, d’ajouter les lieux à une journée de sortie, ou de les placer dans la corbeille.

Avant une action destructive, contrôlez le nombre d’éléments sélectionnés et les filtres actifs.

## Recherche sur la carte

La recherche cartographique accepte un nom, une adresse ou des coordonnées. Les résultats apparaissent temporairement sur la carte. Vous pouvez :

- centrer la vue sur un résultat ;
- créer un nouveau lieu à partir du résultat ;
- en mode Sortie, l’ajouter au jour, à la nuit, au départ ou à l’arrivée actuellement sélectionné.

Le fournisseur par défaut est Stadia. Il fonctionne sans clé personnelle ; une clé Stadia Places facultative et vérifiée permet d’utiliser votre propre forfait. Si une clé Google Places valide est enregistrée dans **Profil > Clés API > Recherche de lieux** et que **Google Places** est sélectionné dans cette même catégorie, la recherche utilise Google Places. La fenêtre de résultats se ferme après un ajout réussi à une sortie.

## Coordonnées, région et cohérence pays

La région est déduite automatiquement des coordonnées quand le service de géocodage inverse répond. Un bouton permet de recalculer la région manuellement. Une valeur saisie manuellement n’est pas remplacée lors d’un simple déplacement du point ; utilisez le recalcul explicite pour la rafraîchir.

Lorsqu’un point se trouve en dehors du pays de la carte, CartaVault affiche un avertissement. Le masque hors pays peut être activé ou désactivé sans bloquer la navigation.
