# Backend de CartaVault

Le routeur `/account` gère le profil personnel, le changement d’e-mail et de mot de passe, les sessions actives, les avatars et la suppression contrôlée. Les avatars JPEG/PNG/WebP sont décodés avec Pillow, recadrés au centre en 256×256 WebP, débarrassés des métadonnées et stockés sous `AVATAR_STORAGE_PATH` (5 Mio et 4096 px maximum). La suppression refuse les propriétaires de cartes et le dernier administrateur actif, puis révoque les sessions et anonymise le compte. Aucun e-mail de validation ni mécanisme 2FA n’est disponible actuellement.

## Authentification, rôles et sécurité

L’API utilise des sessions opaques stockées dans `user_sessions`. Seules les
empreintes SHA-256 des tokens de session, CSRF et d’invitation sont persistées.
Le cookie de session est `HttpOnly`, `SameSite=Lax`, limité à `/`, et son attribut
`Secure` est piloté par `CARTAVAULT_COOKIE_SECURE`. Le frontend renvoie le token
CSRF lisible dans `X-CSRF-Token` pour toute écriture. Les mots de passe sont
hachés avec Argon2id et ne sont jamais renvoyés par l’API.

Toutes les cartes sont privées. La matrice V1 est la suivante :

- `owner` : contenu, import/export, membres, suppression et transfert ;
- `editor` : contenu, photos, catégories/tags, import et export ;
- `viewer` : lecture et export uniquement ;
- administrateur global : accès et administration complets.

Une ressource privée inaccessible renvoie `404` afin de ne pas révéler son
existence ; une action interdite sur une carte visible renvoie `403`. Les
contrôles sont effectués côté serveur jusqu’aux ressources indirectes (POI,
photo, catégorie, tag, preview d’import et export temporaire).

## Création du premier administrateur et mise à niveau

Ne démarrez pas une instance existante entre les deux migrations de sécurité.
Effectuez impérativement une sauvegarde, puis :

```powershell
python -m alembic upgrade d8f4a2c7e910
python -m app.cli create-admin
python -m alembic upgrade head
```

La commande interactive masque le mot de passe, crée un administrateur actif et
attribue toutes les cartes orphelines avec leur membership `owner`. Elle refuse
un e-mail existant. Pour un déploiement automatisé, renseignez temporairement
`CARTAVAULT_BOOTSTRAP_ADMIN_EMAIL`, `CARTAVAULT_BOOTSTRAP_ADMIN_NAME` et
`CARTAVAULT_BOOTSTRAP_ADMIN_PASSWORD`, puis exécutez
`python -m app.cli bootstrap-admin` et retirez les secrets de l’environnement.
La migration finale refuse l’absence d’administrateur actif, les cartes
orphelines ou toute divergence entre `maps.owner_id` et le membership owner.

Les catégories et tags historiques sont copiés pour chaque carte afin de
préserver leur disponibilité globale antérieure, puis toutes les associations
sont remappées. Les nouvelles contraintes et triggers interdisent les
associations entre cartes. Le statut reste global.

## Variables de sécurité

Outre `DATABASE_URL`, configurez selon l’environnement les variables
`CARTAVAULT_SESSION_*`, `CARTAVAULT_CSRF_COOKIE_NAME`,
`CARTAVAULT_INVITATION_HOURS`, `CARTAVAULT_COOKIE_SECURE`,
`CARTAVAULT_PASSWORD_MIN_LENGTH` et les trois paramètres Argon2. En production,
activez obligatoirement `CARTAVAULT_COOKIE_SECURE=true` derrière HTTPS.

Les invitations sont valables sept jours par défaut. CartaVault génère un lien
copiable mais n’envoie aucun e-mail. Le transfert de propriété est transactionnel :
le nouveau propriétaire doit déjà être membre et l’ancien devient `editor`.

## Import KMZ

`app/imports/` fournit une prévisualisation sans écriture puis une confirmation
atomique. Le parser `defusedxml` refuse DTD et entités externes ; `doc.kml` est
préféré, sinon le KML lexicalement premier est retenu. Les données non mappées
sont conservées dans `places.custom_fields` et les images locales valides
réutilisent le stockage photo sécurisé existant. Les limites configurables sont
`KMZ_MAX_UPLOAD_SIZE` (25 Mio), `KMZ_MAX_UNCOMPRESSED_SIZE` (100 Mio),
`KMZ_MAX_ENTRIES` (750), `KMZ_MAX_PLACEMARKS` (1000) et `KMZ_MAX_IMAGES` (500).
Les références identiques sont dédupliquées. La confirmation progressive ne
télécharge chaque URL distante qu’une fois et transforme les échecs d’image en
avertissements sans annuler les POI créés.

La migration `a91d3b6e7f24` ajoute `custom_fields JSONB NOT NULL DEFAULT '{}'`.
Elle doit être testée et appliquée d’abord sur `poi_manager_test`, jamais sur la
base de développement `poi_manager`.

## Statuts des POI

## Catégories et pictogrammes

`shared/category-icons.json` est la source de vérité unique des pictogrammes de catégories. `app.categories.icon_catalog` le charge une seule fois au démarrage du processus, depuis un chemin calculé à partir de son propre fichier, puis valide strictement ses 300 entrées (structure, groupes, préfixes, absence de contenu URL/HTML/SVG, défaut et fallback).

Les nouvelles écritures de `categories.icon` acceptent exclusivement des identifiants qualifiés présents dans ce catalogue, par exemple `mdi:church`. L’absence d’icône utilise `material-symbols:location-on-outline`; le fallback disponible est `material-symbols:help-outline`.

La migration `f3a7c1d9e842` remplace les 17 identifiants Lucide historiques par leurs équivalents Iconify, conserve les IDs Iconify déjà valides et remplace toute valeur inconnue par le défaut. Elle met aussi à jour le défaut SQL de `categories.icon` pour les installations existantes; `database/init/001_initial_schema.sql` emploie le même défaut pour les installations neuves. Son downgrade retourne les valeurs ayant un équivalent historique et transforme toute autre icône Iconify en `map-pin` : il est destructif et ne doit jamais être lancé sur `poi_manager`.

L’association `place_categories.is_primary` est l’unique source de vérité de la catégorie principale ; `PATCH /places/{place_id}/categories/{category_id}` la modifie atomiquement. Le downgrade de la migration des icônes doit uniquement être exécuté sur `poi_manager_test`, jamais sur `poi_manager`.

La feature `app/statuses` expose le CRUD `/statuses`. Un seul statut actif est défini par défaut et il est appliqué lorsque `status_id` est omis à la création d’un POI. Un statut inactif reste lisible sur les anciens POI mais ne peut plus être sélectionné. La suppression du défaut ou d’un statut utilisé renvoie `409`.

`condition` reste l’état physique du site. `status_id` représente exclusivement son suivi. `GET /places` et `GET /places/map` acceptent le filtre `status_id`.

## Modèle pays → cartes → POI

- `GET /countries` expose le catalogue mondial avec recherche par nom ou code.
- `/maps` fournit le CRUD des cartes; centre et zoom `null` héritent du pays.
- `/places` et `/places/map` filtrent par `map_id`; la création l'exige et les
  lectures détaillées embarquent seulement une synthèse carte/pays.
- supprimer une carte non vide renvoie `409 Conflict`.

Le catalogue local `app/countries/data/countries.json` est dérivé de
[mledoze/countries](https://github.com/mledoze/countries), révision
`09b28e3d03e6ca3fbbac996d716a50d929781e8c`, sous
[ODbL 1.0](https://github.com/mledoze/countries/blob/09b28e3d03e6ca3fbbac996d716a50d929781e8c/LICENSE).
Il conserve les codes ISO, le nom français (anglais en repli), le centre et un
zoom calculé de manière déterministe. Les deux territoires Saint-Martin sont
explicitement désambiguïsés. Aucun réseau n'est utilisé au runtime. Le seed
Docker `database/init/002_country_catalog.sql` est généré depuis cette source
unique avec `python scripts/generate_country_seed.py`.

La migration `6f2d8a4c91b0` crée le catalogue et les cartes, rattache chaque POI,
vérifie l'absence de `map_id` nul, puis supprime `places.country`. Une valeur
vide, inconnue ou ambiguë interrompt la transaction. Le downgrade reconstruit
le pays texte depuis les relations avant de supprimer les nouvelles tables.

API FastAPI synchrone de CartaVault, structurée par fonctionnalité et basée
sur SQLAlchemy 2, PostgreSQL/PostGIS, Pydantic 2 et Alembic.

## Prérequis

- Python 3.14 (commandes vérifiées avec Python 3.14.6) ;
- Docker Desktop et Docker Compose pour PostgreSQL/PostGIS ;
- Git ;
- un environnement virtuel Python local.

Le fichier `docker-compose.yml` situé à la racine utilise actuellement l'image
`postgis/postgis:16-3.4`, le service `postgres` et le port hôte `5432`.

## Installation sous Windows PowerShell

Depuis la racine du dépôt :

```powershell
docker compose up -d postgres
Set-Location backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
Copy-Item .env.example .env
```

Adaptez ensuite `.env` à votre environnement. Ce fichier local est ignoré par
Git et ne doit contenir aucun secret destiné au dépôt.

## Variables d'environnement

| Variable | Obligatoire | Rôle et valeur par défaut |
| --- | --- | --- |
| `DATABASE_URL` | Oui | URL SQLAlchemy PostgreSQL utilisée par l'API et Alembic. Exemple non secret : `postgresql+psycopg://poi_user:change_me@localhost:5432/poi_manager`. Aucune valeur par défaut. |
| `TEST_DATABASE_URL` | Non pour l'API, requise pour l'intégration | Base PostgreSQL/PostGIS dédiée aux tests. Aucune valeur par défaut ni reprise automatique de `DATABASE_URL`. |
| `PHOTO_STORAGE_PATH` | Non | Racine du stockage photo. Valeur par défaut : `storage/photos`, résolue relativement au dossier `backend`. Un chemin absolu peut aussi être fourni. |
| `CORS_ALLOWED_ORIGINS` | Non | Liste d'origines web séparées par des virgules. Valeur par défaut : `http://localhost:5173,http://127.0.0.1:5173`. |

Les variables de `.env.example` couvrent toutes les lectures d'environnement
actuellement présentes dans le code.

## Lancement et Swagger

Depuis `backend`, avec l'environnement virtuel activé :

```powershell
python -m uvicorn app.main:app --reload
```

- Swagger UI : <http://127.0.0.1:8000/docs>
- OpenAPI JSON : <http://127.0.0.1:8000/openapi.json>
- contrôle de santé : <http://127.0.0.1:8000/>

Le middleware CORS autorise par défaut les deux origines Vite locales. Il
n'autorise pas les credentials et limite explicitement les méthodes
cross-origin à `GET`, `POST`, `PATCH`, `DELETE` et `OPTIONS`.

## Aperçu des endpoints

| Groupe | Routes principales |
| --- | --- |
| Health | `GET /` |
| Places | `GET /places`, `POST /places`, `GET/PATCH/DELETE /places/{place_id}` |
| Places map | `GET /places/map` avec les quatre limites géographiques obligatoires |
| Associations | `POST/DELETE /places/{place_id}/categories/{category_id}` et `POST/DELETE /places/{place_id}/tags/{tag_id}` |
| Categories | `GET/POST /categories`, `GET/PATCH/DELETE /categories/{category_id}` |
| Tags | `GET/POST /tags`, `GET/PATCH/DELETE /tags/{tag_id}` |
| Photos | `GET/POST /places/{place_id}/photos`, `POST /places/{place_id}/photos/upload`, `GET/PATCH/DELETE /photos/{photo_id}`, `GET /photos/{photo_id}/file` |

`GET /places` accepte notamment la recherche `q`, la pagination et les
filtres par pays, région, catégorie, tag et zone visible. `GET /places/map`
renvoie une représentation légère destinée aux marqueurs et exige
`min_latitude`, `max_latitude`, `min_longitude` et `max_longitude`. Il accepte
également le filtre facultatif `country`, comparé sans tenir compte de la
casse, ainsi que `category_id`, `tag_id` et `limit`.

## Base de données et Alembic

SQLAlchemy définit les modèles et fournit les sessions synchrones utilisées
par FastAPI. GeoAlchemy2 et PostGIS gèrent les coordonnées et requêtes
géographiques. Alembic suit les évolutions du schéma connues du projet.

Commandes sûres à exécuter depuis `backend` :

```powershell
python -m alembic current
python -m alembic check
python -m alembic upgrade head
```

La première révision, `9c74325a9837_baseline_existing_schema.py`, est une
baseline vide issue d'un schéma préexistant. Elle ne crée ni table ni
extension. Par conséquent, `python -m alembic upgrade head` met à niveau une
base déjà préparée, mais ne reconstruit pas nécessairement tout le schéma sur
une base vide. Le démarrage Docker initialise ce schéma avec
`database/init/001_initial_schema.sql` uniquement lors de la création d'un
volume neuf.

## Photos

Deux opérations sont distinctes :

- `POST /places/{place_id}/photos` crée uniquement une ligne de métadonnées ;
- `POST /places/{place_id}/photos/upload` valide, stocke le fichier et crée ses
  métadonnées.

L'upload accepte JPEG, PNG et WebP, vérifie le type MIME et la signature du
fichier, et limite la taille à 20 Mio. Les fichiers sont écrits par défaut
sous `storage/photos/{place_id}/{photo_id}.{extension}`. Les chemins stockés
sont validés pour empêcher les sorties du répertoire de stockage.

La suppression de `DELETE /photos/{photo_id}` retire les métadonnées puis le
fichier physique associé. Le stockage local convient à une instance unique ;
un déploiement multi-instance nécessitera un stockage partagé ou objet.

## Espace Compte

Les endpoints sous `/account` opèrent uniquement sur l’utilisateur de la
session authentifiée : profil, e-mail, mot de passe, sessions, avatar,
préférences et suppression/anonymisation. Les avatars sont contrôlés (JPEG,
PNG ou WebP, 5 Mio), convertis en WebP et stockés sous `storage/avatars/`,
distinctement des photos de POI. `users.preferences` contient les réglages
d’interface validés et non sensibles.

## Tests

Depuis `backend` :

```powershell
python -m pytest
python -m pytest -m unit
python -m pytest -m integration
```

Les tests d'intégration exigent une base PostGIS dédiée configurée avec
`TEST_DATABASE_URL`. Sans cette variable, ils sont explicitement ignorés et
ne se rabattent jamais sur la base de développement.

Voir [`tests/README.md`](tests/README.md) pour la création de la base de test,
les protections, l'isolation transactionnelle et le stockage temporaire.

## Sorties et routage

La feature `app/trips/` gère les voyages, journées, étapes et nuits de façon persistante. Elle réutilise les rôles des cartes et centralise les contrôles d’accès afin d’éviter tout accès indirect à une sortie d’une autre carte. Les statuts de visite d’une étape sont distincts du statut métier du POI ; leur application aux POI exige une confirmation explicite.

Le routage est fourni par une abstraction backend. L’implémentation actuelle utilise OSRM via `ROUTING_OSRM_BASE_URL`, avec délai d’attente et limite de points configurables. Aucune requête OSRM n’est effectuée directement par le navigateur. Les parcours calculés sont stockés dans `trip_days`, invalidés après une modification d’ordre et recalculés sur demande.

Les unités persistées et retournées restent numériques : `route_distance_meters` est exprimé en mètres et `route_duration_seconds` en secondes. Les résumés dérivent aussi les kilomètres et minutes, sans inclure les visites ou les temps annexes dans ces métriques routières. Une route n’est actuelle que lorsque `route_status == "ready"` et que ses deux mesures existent. Les journées absentes ou `stale` sont exclues des sommes routières et rendent `is_route_summary_complete` faux.

La planification temporelle est centralisée dans `app.trips.summary_service` et suit exclusivement la formule `conduite + visites + tampon + marge de sécurité`. Le tampon s’applique entre deux `TripStop` consécutifs ; départs et nuits ne le déclenchent pas. La marge est fixe ou calculée avec un arrondi supérieur en pourcentage. Aucune pause n’est stockée ou calculée. `target_arrival_time` produit un départ recommandé et `planned_start_time` une arrivée estimée avec décalage de jour. Les seuils et couleurs de charge sont persistés sur le voyage et modifiables par un éditeur.

## Arborescence du backend

```text
backend/
├── app/
│   ├── categories/     # modèle, schémas et CRUD des catégories
│   ├── photos/         # métadonnées, upload et stockage des photos
│   ├── places/         # POI, filtres et endpoint cartographique
│   ├── tags/           # modèle, schémas et CRUD des tags
│   ├── database.py     # moteur, Base et sessions SQLAlchemy
│   └── main.py         # application FastAPI et routers
├── migrations/
│   ├── versions/       # révisions Alembic
│   └── env.py
├── storage/            # racine locale des fichiers applicatifs
├── tests/              # suite pytest et fixtures partagées
├── .env.example
├── alembic.ini
├── pytest.ini
└── requirements.txt
```

## Limitations actuelles

- la gestion des catégories et tags reste disponible via l'API uniquement ;
- aucune authentification n'est présente ;
- la baseline Alembic ne recrée pas seule une base vide ;
- le stockage photo local n'est pas adapté tel quel à plusieurs instances.
# Validation « rester dans le pays »

`app.trips.routing.country_validator.CountryRouteValidator` analyse la LineString complète retournée par OSRM après densification. La donnée locale `app/countries/data/routing_boundaries.geojson` est volontairement limitée et versionnée (Natural Earth, domaine public, simplifiée). Une frontière indisponible provoque une erreur métier claire plutôt qu’une acceptation silencieuse. OSRM standard n’est pas présenté comme capable de calculer une alternative nationale ; il est seulement post-validé.

Les seuils, en mètres, sont `ROUTING_COUNTRY_BOUNDARY_TOLERANCE_METERS` (250 par défaut) et `ROUTING_MAX_OUTSIDE_DISTANCE_METERS` (500 par défaut). Les exports contrôlent également les routes déjà calculées quand la préférence est active ; Google Maps reçoit un avertissement car son propre moteur peut choisir un autre trajet.
# Marqueurs par emprise

`GET /places/map` utilise PostGIS (`ST_MakeEnvelope`, `ST_Intersects`) et charge seulement les relations nécessaires. Avec `include_meta=true`, la réponse contient `items`, `total`, `returned` et `truncated`; la limite est explicite.
# Filtres et opérations groupées

`GET /places` et `GET /places/map` partagent les filtres validés de `app.places.filtering`. `POST /places/bulk` accepte au plus 500 identifiants explicites et une action discriminée (`set_status`, catégories, tags ou suppression). Tous les POI et les objets associés sont contrôlés dans la même transaction avec le rôle éditeur requis.
