# POI Manager

POI Manager est un projet auto-hébergé de gestion de points d'intérêt (POI)
géographiques. Le backend fournit une API FastAPI synchrone adossée à
PostgreSQL/PostGIS. Une interface avec carte interactive est prévue, mais
n'est pas encore développée.

## Fonctionnalités actuelles

- CRUD des POI avec coordonnées géographiques PostGIS ;
- recherche textuelle, filtres par pays, région, catégorie et tag ;
- filtrage des POI par zone géographique visible ;
- endpoint léger `GET /places/map` pour les marqueurs cartographiques ;
- CRUD des catégories et association avec les POI ;
- CRUD des tags et association avec les POI ;
- métadonnées photo, upload sécurisé JPEG, PNG et WebP ;
- téléchargement et suppression des fichiers photo ;
- suivi du schéma avec Alembic ;
- tests unitaires et d'intégration avec pytest.

## Architecture

```text
poi-manager/
├── backend/
│   ├── app/            # API organisée par fonctionnalité
│   ├── migrations/     # environnement et révisions Alembic
│   ├── storage/        # stockage photo local
│   └── tests/          # tests pytest
├── database/
│   └── init/           # initialisation SQL du conteneur PostgreSQL
├── frontend/           # réservé au futur frontend cartographique
├── docker-compose.yml
└── README.md
```

La documentation technique détaillée se trouve dans
[`backend/README.md`](backend/README.md).

## Démarrage rapide sous Windows

Prérequis : Python 3.14, Docker Desktop avec Docker Compose et Git.

Depuis la racine du dépôt :

```powershell
docker compose up -d postgres
Set-Location backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
Copy-Item .env.example .env
```

Dans `.env`, remplacez la valeur d'exemple de `DATABASE_URL` par les
identifiants configurés dans `docker-compose.yml`. Ne versionnez pas ce
fichier.

Le conteneur initialise le schéma avec `database/init` lors de la création
d'un volume vide. Sur cette base initialisée, appliquez ensuite les révisions
Alembic et démarrez l'API depuis `backend` :

```powershell
python -m alembic upgrade head
python -m uvicorn app.main:app --reload
```

Swagger est alors disponible sur <http://127.0.0.1:8000/docs>.

> La baseline Alembic initiale représente un schéma préexistant et ne crée
> aucune table. `alembic upgrade head` ne suffit donc pas, à lui seul, à
> reconstruire une base entièrement vide hors de la procédure Docker fournie.

## État du projet

Le backend couvre actuellement la gestion des POI, catégories, tags et
photos. Le dossier `frontend` est vide : la carte interactive et son interface
utilisateur restent à construire.

## Feuille de route

Ces éléments sont envisagés et ne sont pas encore disponibles :

- frontend avec carte interactive ;
- clustering des marqueurs ;
- import KML/KMZ ;
- export KMZ ;
- import depuis Google Maps ou une API compatible ;
- authentification et gestion des utilisateurs ;
- éventuel stockage objet des photos pour les déploiements distribués.
