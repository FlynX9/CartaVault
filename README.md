# POI Manager

## Photos des POI

Les photos utilisent le stockage sécurisé existant. L’édition d’un POI permet
l’upload multiple, la photo principale, l’ordre et la suppression.

## Statuts de suivi configurables

La couleur d’un marqueur provient exclusivement du statut. Son pictogramme provient de la catégorie principale du POI : une seule peut être principale, la première association est choisie automatiquement et son retrait promeut la catégorie restante au plus petit UUID. Les icônes sont des identifiants d’un catalogue fermé ; aucune URL ni aucun SVG arbitraire n’est stocké.

La carte comporte une légende compacte des statuts actifs, qui affiche le nom associé à chaque couleur de marqueur. Son fond est sélectionnable sans recharger Leaflet : CartaVault Light et Dark (Stadia Alidade Smooth), Satellite (Alidade Satellite) ou OpenStreetMap Standard. Le choix est local au navigateur (`cartavault.basemap`). Pour Stadia hors localhost, configurer `VITE_STADIA_MAPS_API_KEY` dans `frontend/.env` ou l'authentification par domaine; les variables `VITE_*` sont exposées au navigateur et ne doivent contenir qu'une clé restreinte.

Chaque POI possède un statut de suivi administrable (`À faire`, `Fait`, etc.). Sa couleur hexadécimale pilote directement le marqueur et le filtre `status` de l’URL est appliqué à la carte comme à la liste. Le statut de suivi est distinct de `condition`, qui décrit l’état physique du lieu. Les pictogrammes par catégorie restent hors périmètre.

## Catalogue partagé des icônes de catégories

`shared/category-icons.json` est la source de vérité commune au frontend et au backend. Il contient 80 identifiants Iconify qualifiés, validés au chargement côté API et résolus localement côté frontend, sans URL, SVG arbitraire ni appel réseau. Les nouvelles catégories utilisent `material-symbols:location-on-outline` par défaut et n’acceptent que les identifiants du catalogue; `material-symbols:help-outline` est le fallback.

La migration Alembic `f3a7c1d9e842` convertit les 17 identifiants Lucide historiques vers ce catalogue et remplace les valeurs inconnues par le défaut Iconify. Les identifiants Iconify déjà valides sont conservés. Son downgrade est volontairement destructif pour les nouvelles icônes sans équivalent Lucide : elles deviennent `map-pin`. Il ne doit jamais être exécuté sur `poi_manager`.

## Pays, cartes et POI

Le domaine suit la relation normalisée `countries → poi_maps → places`. Le
catalogue des pays alimente « Créer une carte », tandis que le sélecteur
principal n'affiche que les cartes effectivement créées. Chaque POI appartient
obligatoirement à une carte par `map_id`; son pays est déduit de cette carte et
n'est plus stocké comme texte libre.

La V1 impose une seule carte par pays. Une carte contenant des POI ne peut pas
être supprimée et aucune cascade destructive n'est configurée.

## Interface cartographique type My Maps

La carte reste visible pendant toutes les opérations. La liste fixe gauche
affiche les POI de la carte active; un clic dans la liste ou sur un marqueur
ouvre une infobulle enrichie ancrée au marqueur avec détails, catégories, tags,
coordonnées et photos. Les actions modifier, supprimer, Google Maps et fermer
sont directement disponibles dans cette fiche.

La création et l'édition utilisent le formulaire existant dans un panneau
flottant au-dessus de la carte. Les URLs `/places/:id`, `/places/:id/edit` et
`/places/new` restent partageables sans produire de page de consultation
isolée. Sur mobile, la liste est escamotable et le formulaire devient un
panneau inférieur afin de conserver la carte visible.

POI Manager est un projet auto-hébergé de gestion de points d'intérêt (POI)
géographiques. Le backend fournit une API FastAPI synchrone adossée à
PostgreSQL/PostGIS. Une première interface React affiche les POI visibles sur
une carte interactive Leaflet alimentée par OpenStreetMap.

## Fonctionnalités actuelles

- CRUD des POI avec coordonnées géographiques PostGIS ;
- recherche textuelle, filtres par pays, région, catégorie et tag ;
- filtrage des POI par zone géographique visible ;
- endpoint léger `GET /places/map` pour les marqueurs cartographiques ;
- frontend React TypeScript avec carte permanente, sélection du pays, liste synchronisée des POI, volet latéral de gestion et administration des catégories et tags ;
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
conserve la carte visible, filtre les marqueurs par pays et affiche une liste
alphabétique recherchable synchronisée avec la carte. Le pays actif est
partageable dans l'URL et déclenche un recentrage adapté. Un volet latéral affiche l'aperçu, la fiche
détaillée, les photos ainsi que les formulaires de création et de modification.
Les URL directes des POI restent partageables et un lien vers Google Maps est
proposé lorsque les coordonnées sont disponibles. Sur mobile, le volet devient
un panneau superposé et défilable. Il est aussi possible de supprimer un POI,
de choisir sa position sur carte et de gérer ses catégories et tags. Une section
d'administration permet également de rechercher, créer, modifier et supprimer
les catégories et tags, sans authentification à ce stade.

La configuration cartographique des pays est encore temporaire et limitée aux
valeurs réellement utilisées — actuellement la France. La normalisation future
prévoit des codes ISO, centres, zooms et limites stockés en base.

## Feuille de route

Ces éléments sont envisagés et ne sont pas encore disponibles :

- icônes et couleurs configurables pour les catégories ;
- clustering des marqueurs ;
- import KML/KMZ ;
- export KMZ ;
- import depuis Google Maps ou une API compatible ;
- authentification et gestion des utilisateurs ;
- éventuel stockage objet des photos pour les déploiements distribués.
