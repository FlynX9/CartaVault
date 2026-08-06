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

## La recherche d'adresse renvoie de mauvais résultats

Vérifiez le fournisseur sélectionné dans **Profil > Préférences > Places**. Stadia et Google Places n'utilisent pas les mêmes index. Pour Google Places, contrôlez que la clé est vérifiée et que l'API Places correspondante est autorisée dans Google Cloud. Ajoutez le pays ou la ville à une requête ambiguë.

## La région reste vide

Utilisez l'action de recalcul de la région sur la fiche. Si la valeur reste vide, le service de géocodage inverse n'a probablement pas trouvé de subdivision pour les coordonnées ou est temporairement indisponible. Vérifiez les coordonnées avant de saisir une région manuellement.

## Une photo ne s'affiche pas

Rechargez la fiche puis vérifiez la médiathèque. Si l'image reste absente, consultez les journaux de stockage et les quotas. Une photo de nuit n'apparaît volontairement pas dans la médiathèque de la carte.

## Un import ou export reste en attente

En mode standard, gardez l'interface ouverte pendant une tâche synchrone. Avec Redis, vérifiez que Redis et le worker utilisent la même version d'image que l'application et que le worker est sain. Contrôlez également le volume d'imports/exports et l'espace disque.

## Un téléchargement PDF ne démarre pas

Laissez le dialogue d'export ouvert jusqu'à la fin du transfert. Un message d'erreur y permet de relancer. Vérifiez l'espace du volume d'exports et les journaux backend ; les bloqueurs de popups ne devraient pas intervenir, car CartaVault déclenche le téléchargement après réception du fichier.

## Une invitation n'arrive pas

Vérifiez d'abord le centre de notifications du destinataire. Pour l'e-mail, contrôlez le fournisseur, l'adresse d'expédition, le statut de la clé Resend ou les paramètres SMTP. L'échec d'envoi n'annule pas nécessairement l'invitation créée dans CartaVault.

## Une donnée supprimée doit être récupérée

Ouvrez la **Corbeille** et restaurez l'élément avant expiration de la durée de conservation. Une suppression définitive exige une restauration de sauvegarde ; l'historique et Annuler/Rétablir ne remplacent pas cette sauvegarde.

## Demander de l'aide

Joignez la version, le mode de déploiement, les étapes de reproduction et les journaux utiles. Supprimez mots de passe, cookies, jetons, adresses personnelles et clés API avant de publier une issue.
