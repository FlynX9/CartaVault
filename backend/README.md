# Backend de POI Manager

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

API FastAPI synchrone de POI Manager, structurée par fonctionnalité et basée
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
