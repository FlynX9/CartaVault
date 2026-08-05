---
title: Dépannage
description: Diagnostiquer les problèmes courants sans exposer de secrets.
sidebar:
  order: 5
---

## La connexion renvoie « Invalid CSRF token »

Vérifiez que l'URL publique correspond exactement à l'adresse utilisée dans le navigateur, protocole compris. Contrôlez `CARTAVAULT_PUBLIC_URL`, `FRONTEND_PUBLIC_URL`, `CORS_ALLOWED_ORIGINS`, le proxy inverse et l'attribut Secure du cookie.

## Le backend ne démarre pas sous Windows

Une erreur `WinError 10013` indique généralement que le port est réservé ou déjà occupé. Identifiez le processus avec `Get-NetTCPConnection`, arrêtez l'ancien serveur ou choisissez un autre port.

## La documentation API ne s'affiche pas

Dans le déploiement unifié, ouvrez `/api/docs`. Le schéma est servi sous `/api/openapi.json`. Une réponse HTML à la place du JSON signale souvent une règle de proxy incorrecte.

## Un calcul d'itinéraire échoue

Vérifiez la validité de la clé du fournisseur, ses API autorisées et ses quotas. CartaVault applique une temporisation après les réponses de limitation et réutilise les résultats en cache lorsqu'ils sont encore valides.

## Demander de l'aide

Joignez la version, le mode de déploiement, les étapes de reproduction et les journaux utiles. Supprimez mots de passe, cookies, jetons, adresses personnelles et clés API avant de publier une issue.
