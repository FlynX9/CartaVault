---
title: Chronologie et exports de sortie
description: Explorer visuellement un voyage et produire ses documents ou traces.
sidebar:
  order: 9
---

## Ouvrir la chronologie

Dans le panneau Sortie, activez **Chronologie du voyage**. Le panneau Lieux et toute fiche ouverte se ferment pour laisser la carte au voyage. La vue est cadrée sur l’ensemble du trajet, pas sur le pays entier.

La frise contient le départ, les étapes, les nuits et l’arrivée. Les zones colorées matérialisent les journées. Un avertissement rouge signale une journée ou une nuit incomplète.

## Naviguer

Cliquez sur un point, utilisez la molette au-dessus de la frise, faites glisser la frise horizontalement ou appuyez sur les flèches gauche/droite du clavier. Le point actif revient au centre entre les chevrons.

La sélection :

- colore et agrandit le point actif ;
- met en avant le ou les tracés concernés sur la carte ;
- affiche le segment entre le point actif et le suivant dans le cartouche inférieur ;
- ouvre la fiche liée quand le point correspond à un lieu ou à un hébergement.

Sélectionner une nuit met en évidence le trajet qui y arrive et celui qui en repart. Le niveau de zoom global du voyage reste stable pendant la navigation.

## Comprendre le cartouche de segment

Le cartouche affiche le nom du départ du segment, sa distance, son temps de route et le nom de l’arrivée. Si le segment n’a pas été calculé, les valeurs restent indisponibles jusqu’au prochain calcul d’itinéraires.

## Export PDF

Le dialogue **Options d’export** permet d’inclure :

- la carte générale du voyage ;
- une carte pour chaque journée avec son itinéraire et ses étapes ;
- les photos principales des lieux ;
- des QR codes Google Maps, Waze, ou les deux.

Le document suit la langue du compte. Chaque journée présente ses étapes, leur durée de visite et les déplacements entre elles. Les QR contiennent uniquement des liens construits à partir des coordonnées ; la génération ne contacte pas Google Maps ou Waze.

Les fonds cartographiques du PDF peuvent nécessiter le téléchargement de tuiles OpenStreetMap configurées par l’administrateur. Une tuile indisponible ne doit pas empêcher l’export du reste du document.

## Export GPX

Le GPX fournit les traces calculées aux applications compatibles. Recalculez les journées obsolètes avant l’export pour éviter d’obtenir une trace incomplète.

## Export KMZ

Le KMZ conserve une représentation cartographique transportable du voyage et de ses points. Il convient aux outils capables de lire ce format.

## Liens Google Maps

L’export Google Maps découpe une journée en plusieurs liens lorsque le nombre de points dépasse la capacité d’une URL de navigation. Les avertissements précisent les journées ou segments qui n’ont pas pu être inclus.

## Téléchargement

La génération se fait côté serveur. CartaVault attend que le fichier soit réellement reçu avant de fermer le dialogue, ce qui évite les téléchargements silencieusement bloqués par le navigateur. En cas d’erreur, laissez le dialogue ouvert et relancez l’opération après avoir vérifié le message.
