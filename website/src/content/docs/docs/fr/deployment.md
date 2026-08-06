---
title: Déploiement et exploitation
description: Installer, mettre à jour, sauvegarder et superviser une instance CartaVault.
sidebar:
  order: 12
---

## Architecture standard

La pile recommandée pour une bêta mono-instance contient :

- l’image unifiée `ghcr.io/flynx9/cartavault` pour l’interface, l’API et les migrations ;
- PostgreSQL/PostGIS pour les données géographiques ;
- des volumes persistants pour les photos, avatars, imports et exports.

Redis et le worker constituent une extension facultative pour les imports et tâches longues. Le mode standard reste utilisable sans eux.

## Préparer la configuration

Copiez le modèle d’environnement correspondant à Docker Compose ou Portainer. Définissez au minimum la base de données, l’URL publique, les origines CORS, l’adresse d’expédition et les secrets CartaVault.

Générez les secrets avec :

```bash
python -m app.setup_cli generate-secrets
```

Conservez `CARTAVAULT_CREDENTIALS_ENCRYPTION_KEY` durablement. Sa perte rend illisibles les clés Google et Resend déjà enregistrées.

## Premier démarrage

1. Démarrez PostGIS et attendez son état sain.
2. Démarrez CartaVault ; l’entrée du conteneur applique les migrations Alembic sous verrou.
3. Ouvrez l’URL publique.
4. Saisissez le jeton d’installation si l’assistant le demande.
5. Créez le premier administrateur.

L’assistant initial se verrouille après la création du premier administrateur.

## Mise à jour

1. Effectuez une sauvegarde cohérente.
2. Remplacez `CARTAVAULT_VERSION` par un tag immuable, par exemple `0.9.0-beta.1`.
3. Téléchargez l’image et recréez le service.
4. Surveillez les migrations et `/healthz`.
5. Vérifiez une connexion, une carte, une photo et un calcul représentatif.

Évitez le tag flottant `beta` pour une production reproductible. Ne rétrogradez pas l’application contre un schéma plus récent sans procédure de restauration compatible.

## Sauvegarde

Une sauvegarde complète regroupe la base PostgreSQL, les photos, les avatars, la configuration et la clé de chiffrement. Utilisez `docker/backup.sh`, vérifiez `SHA256SUMS`, puis copiez le résultat hors de l’hôte.

Testez régulièrement la restauration sur un projet Docker isolé. Une sauvegarde jamais restaurée n’est pas une garantie de reprise.

## Redis et worker

Activez l’extension Compose Redis lorsque les tâches longues ne doivent plus occuper le processus web. Redis conserve la file et le worker exécute les tâches. Utilisez un mot de passe Redis, un volume persistant et la même version d’image pour l’application et le worker.

## E-mails

CartaVault prend en charge Resend et SMTP générique. Configurez l’identité d’expédition, le transport et ses secrets. `EMAIL_PROVIDER=none` désactive explicitement les envois sans annuler les opérations métier.

## Santé et diagnostic

Le panneau d’administration expose la version, la révision Alembic, la disponibilité PostGIS, le stockage, le routage et l’état de l’e-mail sans révéler les secrets. L’endpoint `/healthz` sert aux orchestrateurs.

Consultez les [variables d’environnement](/docs/fr/reference/environment/), les [commandes d’administration](/docs/fr/reference/cli/) et le [dépannage](/docs/fr/troubleshooting/).
