---
title: Compte, préférences et sécurité
description: Personnaliser CartaVault, gérer les sessions et protéger son compte.
sidebar:
  order: 10
---

## Profil

Le panneau **Profil** permet de modifier le nom d’affichage et l’avatar. Le nom est visible par les utilisateurs avec lesquels vous partagez des cartes. Les informations du compte rappellent l’adresse e-mail, la date de création, la dernière connexion et le nombre de cartes possédées.

## Sécurité du compte

Dans **Sécurité**, vous pouvez changer l’adresse e-mail ou le mot de passe. Ces opérations demandent le mot de passe actuel. Un changement sensible révoque ou renouvelle les sessions selon le cas et génère une notification de sécurité lorsque l’envoi d’e-mails est configuré.

La réinitialisation de mot de passe utilise un lien temporaire, à usage unique. La demande initiale renvoie toujours une réponse générique afin de ne pas révéler si une adresse possède un compte.

## Sessions

Le panneau **Sessions** affiche les appareils ou navigateurs authentifiés, leur dernière activité et la session courante. Vous pouvez révoquer une session précise ou toutes les autres sessions. Une session révoquée doit se reconnecter lors de sa prochaine requête protégée.

## Préférences générales

Les préférences comprennent :

- langue française ou anglaise ;
- fond cartographique clair ou sombre ;
- densité compacte, confortable ou espacée ;
- écran de démarrage : tableau de bord, cartes, lieux ou dernier écran ;
- fuseau horaire ;
- durée de conservation personnelle de la corbeille ;
- état du guide d’onboarding.

Le bouton de réinitialisation restaure les préférences par défaut, sans supprimer vos cartes ni vos lieux.

## Préférences de routage

Choisissez OSRM ou Google Routes, puis les contraintes de pays, péage, autoroute, ferry et trafic disponibles. Consultez [Routage et optimisation](/docs/fr/routing/) pour leur effet sur les calculs.

## Fournisseur de recherche de lieux

Stadia est disponible sans clé personnelle. Google Places devient sélectionnable après enregistrement et vérification d’une clé compatible. La clé Places est distincte de la clé Routes, même si Google Cloud peut autoriser les deux API sur un même projet.

## Clés Google personnelles

Les clés Routes et Places sont chiffrées avant stockage. CartaVault n’affiche jamais leur valeur complète après enregistrement. Utilisez **Vérifier** après une modification et supprimez une clé devenue inutile. La suppression exige votre mot de passe.

## Annuler et rétablir

Les boutons de la barre supérieure, `Ctrl+Z` et `Ctrl+Y` annulent ou rétablissent les dernières opérations compatibles : ajout, déplacement ou suppression de lieux et d’éléments de sortie. L’historique est lié à la session d’interface et ne remplace pas les sauvegardes ni la corbeille.

## Supprimer son compte

La zone sensible exige le mot de passe et une confirmation explicite. Les garde-fous empêchent notamment la disparition du dernier administrateur et demandent de traiter les cartes encore possédées. Transférez leur propriété avant de supprimer le compte.
