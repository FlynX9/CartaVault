# Audit des paramètres d’administration

Cet inventaire accompagne le panneau `/admin`. Il classe les réglages sans exposer de secret et évite de transformer le navigateur en éditeur de configuration de déploiement.

## 1. Administrable depuis l’interface

| Élément | Stockage | Interface |
|---|---|---|
| Comptes, rôle et activation | PostgreSQL (`users`) | Administration > Utilisateurs |
| Demandes d’inscription | PostgreSQL | Administration > Utilisateurs |
| Clé globale Resend | PostgreSQL, chiffrée par Fernet | Administration > Clés API ; valeur jamais relue |
| Quotas globaux | PostgreSQL (`system_settings`) | Administration > Quotas et usages |
| Exceptions de quota utilisateur | `users.preferences.quota_limits` | Administration > Quotas et usages |
| Clé personnelle Google Routes | PostgreSQL, chiffrée et rattachée au compte | Compte > Préférences, jamais dans l’administration globale |

Les quotas applicables dans cette version concernent les cartes, lieux, membres, taille d’un fichier photo et stockage photo. Un dépassement bloque seulement la nouvelle écriture avec une erreur métier ; aucune donnée existante n’est supprimée.

## 2. Visible en lecture seule

- version CartaVault (`CARTAVAULT_VERSION`) ;
- disponibilité et version PostgreSQL/PostGIS ;
- révision Alembic active ;
- état du stockage photo et espace disque ;
- état de présence de la clé maîtresse de chiffrement, sans sa valeur ;
- disponibilité ponctuelle d’OSRM avec timeout court ;
- état de la configuration e-mail ;
- compteurs utilisateurs, cartes, lieux et photos ;
- nombre de comptes disposant d’une clé Google Routes personnelle, sans valeur ni identité détaillée.

## 3. Strictement réservé au déploiement

- `DATABASE_URL`, `TEST_DATABASE_URL` ;
- `CARTAVAULT_CREDENTIALS_ENCRYPTION_KEY` ;
- paramètres cookies, CSRF, sessions, Argon2 et bootstrap administrateur ;
- origines CORS ;
- chemins `PHOTO_STORAGE_PATH` et `AVATAR_STORAGE_PATH` ;
- URL, profil, timeouts et limites OSRM ;
- URL et timeouts Google Routes ;
- identité d’expédition e-mail et URL publique frontend ;
- limites de sécurité KMZ ;
- URLs/styles/fournisseurs cartographiques `VITE_*` ;
- `VITE_API_BASE_URL`.

Ces valeurs ne sont ni renvoyées intégralement au frontend ni modifiables dans le navigateur. Une origine externe est uniquement signalée comme telle lorsqu’elle est pertinente.

## 4. À traiter dans de futures issues

- journal d’audit administratif persistant ;
- rate limiting centralisé des mutations administratives ;
- métriques persistantes d’import, export, calculs d’itinéraire et consommation Google Routes ;
- journal d’erreurs applicatif filtré et exploitable dans la page d’état ;
- alertes de quota avant blocage et notifications ;
- gestion globale d’autres fournisseurs de credentials ;
- authentification à deux facteurs et politiques d’entreprise.

## Surfaces historiques

L’ancien panneau utilisateurs intégré au workspace cartographique n’est plus routé. Les anciens endpoints `/admin/users` sont conservés temporairement pour compatibilité, tandis que la console utilise les endpoints paginés `/admin/console/*`. Leur retrait pourra faire l’objet d’une issue de dépréciation après vérification des clients externes.

