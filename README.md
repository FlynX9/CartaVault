# POI Manager

POI Manager est un projet auto-hébergé de gestion de points d'intérêt (POI)
géographiques. Le backend fournit une API FastAPI synchrone adossée à
PostgreSQL/PostGIS. Une première interface React affiche les POI visibles sur
une carte interactive Leaflet alimentée par OpenStreetMap.

## Fonctionnalités actuelles

- CRUD des POI avec coordonnées géographiques PostGIS ;
- recherche textuelle, filtres par pays, région, catégorie et tag ;
- filtrage des POI par zone géographique visible ;
- endpoint léger `GET /places/map` pour les marqueurs cartographiques ;
- frontend React TypeScript avec carte permanente, volet latéral de gestion des POI et administration des catégories et tags ;
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
├── frontend/           # application Vite, React TypeScript et Leaflet
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

Dans un second terminal, démarrez le frontend :

```powershell
Set-Location frontend
npm install
Copy-Item .env.example .env
npm run dev
```

Vite affiche l'URL locale, généralement <http://localhost:5173>.

> La baseline Alembic initiale représente un schéma préexistant et ne crée
> aucune table. `alembic upgrade head` ne suffit donc pas, à lui seul, à
> reconstruire une base entièrement vide hors de la procédure Docker fournie.

## État du projet

Le backend couvre la gestion des POI, catégories, tags et photos. Le frontend
conserve la carte visible et affiche dans un volet latéral l'aperçu, la fiche
détaillée, les photos ainsi que les formulaires de création et de modification.
Les URL directes des POI restent partageables et un lien vers Google Maps est
proposé lorsque les coordonnées sont disponibles. Sur mobile, le volet devient
un panneau superposé et défilable. Il est aussi possible de supprimer un POI,
de choisir sa position sur carte et de gérer ses catégories et tags. Une section
d'administration permet également de rechercher, créer, modifier et supprimer
les catégories et tags, sans authentification à ce stade.

## Feuille de route

Ces éléments sont envisagés et ne sont pas encore disponibles :

- icônes et couleurs configurables pour les catégories ;
- clustering des marqueurs ;
- import KML/KMZ ;
- export KMZ ;
- import depuis Google Maps ou une API compatible ;
- authentification et gestion des utilisateurs ;
- éventuel stockage objet des photos pour les déploiements distribués.
