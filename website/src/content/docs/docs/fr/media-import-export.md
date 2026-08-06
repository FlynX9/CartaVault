---
title: Médias, imports et exports
description: Gérer les photos et échanger les données d’une carte en KML ou KMZ.
sidebar:
  order: 5
---

## Photos des lieux

Une fiche peut contenir plusieurs photos. Vous pouvez les téléverser depuis un fichier ou coller une capture présente dans le presse-papiers avec `Ctrl+V` lorsque la fiche autorise l’édition. Choisissez une photo principale, réordonnez la galerie, ouvrez une image en grand ou supprimez-la.

La première photo sert de miniature dans la liste et dans les écrans qui demandent un aperçu. Les formats acceptés et la taille maximale dépendent des quotas de l’instance.

## Médiathèque

Le panneau **Médias** rassemble les photos des lieux de la carte. Il permet de rechercher, parcourir, ouvrir le lieu d’origine, définir la photo principale et supprimer un ou plusieurs médias.

Les photos privées ajoutées à une nuit de sortie ne sont pas intégrées à cette médiathèque. Elles restent attachées uniquement à l’hébergement concerné.

## Importer un KML ou KMZ

1. Ouvrez la carte cible et choisissez **Importer**.
2. Sélectionnez le fichier KML ou KMZ.
3. Attendez l’analyse préliminaire.
4. Examinez les lieux détectés, les doublons possibles, les médias et les avertissements.
5. Confirmez l’import, ou forcez les éléments explicitement signalés lorsque vous avez vérifié leur cohérence.

L’import crée les lieux avec la catégorie protégée **Importé** lorsque le fichier ne fournit pas une classification CartaVault. Les fichiers volumineux peuvent être exécutés comme tâches d’arrière-plan si l’instance utilise Redis et un worker.

Ne fermez pas la page tant que l’import synchrone n’est pas terminé. En mode asynchrone, son état reste consultable dans l’historique des tâches.

## Gérer les doublons

L’aperçu d’import sert à éviter la duplication accidentelle de lieux proches ou portant le même nom. Un avertissement n’est pas une suppression automatique : comparez les coordonnées et le contenu, puis choisissez de conserver, ignorer ou forcer l’élément selon le dialogue proposé.

## Exporter une carte

Depuis le catalogue des cartes, choisissez l’action d’export KML/KMZ. Les options permettent d’inclure les informations, styles et médias pris en charge. Le fichier est généré côté serveur puis téléchargé par le navigateur.

Les exports de sortie — PDF, GPX, KMZ et liens Google Maps — sont décrits dans [Chronologie et exports de sortie](/docs/fr/timeline-exports/).

## Confidentialité et stockage

Les photos sont stockées sur l’instance CartaVault. Les exports temporaires sont placés dans le stockage d’exports puis nettoyés selon la politique du serveur. Un export crée une copie transportable : protégez le fichier téléchargé s’il contient des coordonnées, photos ou descriptions privées.
