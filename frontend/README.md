# Frontend cartographique de POI Manager

## Gestion des photos

Le panneau d’édition fournit l’upload multiple JPEG, PNG et WebP (20 Mio par
fichier), la photo principale, l’ordre et la suppression. Les images restent
chargées uniquement depuis l’endpoint de fichier officiel ; il n’existe pas
encore d’endpoint de miniatures.

## Import KMZ

Avec une carte active, le bouton d’import du panneau **Lieux** ouvre un assistant
en modale : sélection d’un fichier `.kmz`, analyse, aperçu compact des points,
sélection explicite, confirmation et rapport. Aucun POI n’est créé au téléversement.
Après confirmation, la liste et les marqueurs sont rafraîchis sans remonter
`MapContainer`.

## Statuts et marqueurs

La couleur d’un marqueur vient du statut ; son pictogramme vient exclusivement de l’icône de sa catégorie principale. Les icônes Lucide sont choisies dans une liste fermée de l’administration, avec `map-pin` par défaut et `circle-help` comme fallback sûr pour une donnée ancienne ou inconnue.

Une légende compacte des statuts actifs reste visible sur la carte : chaque nom accompagne sa couleur afin que l’information ne soit jamais portée par la seule pastille.

Les statuts sont gérés dans `/admin/statuses` (nom, couleur `#RRGGBB`, ordre, activité et défaut). Le formulaire POI ne propose que les statuts actifs, tout en conservant le statut inactif courant en édition. Le générateur central de marqueurs utilise `place.status.color`; la sélection ajoute un contour sans remplacer cette couleur métier. Le filtre visible est conservé dans le paramètre d’URL `status`.

Les futures icônes liées aux catégories ne sont pas encore implémentées.

## Cartes normalisées

« Créer une carte » recherche dans le catalogue mondial et propose le nom du
pays. Le sélecteur principal consomme uniquement `GET /maps`, donc un pays sans
carte n'y apparaît pas. La carte active est conservée sous `?map=<uuid>` et son
centre/zoom provient des valeurs effectives de l'API.

La liste et les marqueurs envoient `map_id`. La création d'un POI utilise
automatiquement la carte active; l'édition permet de déplacer le POI vers une
autre carte. Limites V1 : une carte par pays, pas de frontières, clustering,
vue satellite, recherche géographique ni icônes métier des POI.

## Consultation et édition intégrées

La consultation suit une interaction proche de Google My Maps : liste fixe à
gauche, carte permanente et infobulle enrichie au marqueur. La fiche charge
indépendamment `GET /places/{id}` et `GET /places/{id}/photos`; chaque image est
servie exclusivement par `GET /photos/{photo_id}/file`. Une image manquante ou
une erreur photo ne masque jamais les informations textuelles.

Les actions compactes de la popup permettent de modifier, confirmer une
suppression, ouvrir Google Maps ou fermer. Le formulaire POI existant est
réutilisé dans un panneau flottant pour la création et l'édition. Fermer la
popup revient à `/?map=<uuid>`; les liens directs restaurent la carte, la
sélection et la fiche. Sous 760 px, le panneau d'édition devient une fiche
inférieure et la liste est masquée pendant l'édition.

Interface React TypeScript de POI Manager. Elle affiche les POI visibles sur
une carte Leaflet, présente un aperçu au clic et permet de consulter, créer,
modifier et supprimer les POI et leurs associations.

## Prérequis

- Node.js 24 (développement vérifié avec Node.js 24.18.0) ;
- npm ;
- le backend POI Manager accessible en HTTP.

## Installation

Depuis `frontend` :

```powershell
npm install
Copy-Item .env.example .env
```

Le fichier `.env` local est ignoré par Git. La variable disponible est :

```dotenv
VITE_API_BASE_URL=http://127.0.0.1:8000
VITE_STADIA_MAPS_API_KEY=
```

L'URL est normalisée par `src/config.ts`, afin qu'une barre oblique finale ne
produise pas de doubles `/` dans les appels API.

## Fonds cartographiques

La carte principale propose CartaVault Light (Stadia Alidade Smooth), CartaVault
Dark (Alidade Smooth Dark), Satellite (Alidade Satellite) et OpenStreetMap
Standard. Le choix est conservé localement sous `cartavault.basemap`; il ne
modifie ni l'URL, ni le centre, ni le zoom, ni les POI affichés.

`VITE_STADIA_MAPS_API_KEY` est facultative en local sur `localhost`. Hors
local, utilisez une clé ou l'authentification par domaine configurée dans
Stadia Maps. Les variables `VITE_*` sont publiques dans le navigateur : ne
placez jamais de secret non restreint dans ce fichier. En cas d'indisponibilité
de Stadia, le contrôle permet de basculer explicitement vers OpenStreetMap.

## Shell CartaVault

La première passe de la refonte visuelle installe un shell responsive : navigation
verticale CartaVault, barre supérieure claire, panneau POI stable à gauche et
carte dominante. Les couleurs, rayons, ombres, dimensions et niveaux de calques
sont centralisés dans les variables `--cv-*` de `src/index.css`. Les logos sont
issus de `src/assets/branding/`. Sur mobile, la navigation devient une barre
inférieure compacte ; les composants métier (formulaires, popup et lignes POI)
conservent volontairement leur structure actuelle pour une passe ultérieure.

La seconde passe harmonise les surfaces métier visibles : panneau et lignes de
POI, filtres, popup, recherche géographique, sélection de fond, légende,
menu contextuel et panneau d'édition. Les données, les routes, les appels API
et les interactions existantes sont conservés.

## Recherche géographique

La recherche géographique superposée à la carte est indépendante du filtre
« Rechercher un POI » de la liste CartaVault. Elle envoie une requête Stadia
uniquement après validation par le bouton ou Entrée, jamais à chaque frappe.
Elle accepte `48.8566, 2.3522`, `48.8566 2.3522` et `48,8566 ; 2,3522` ; les
coordonnées valides sont traitées localement sans appel réseau. Les résultats
Stadia sont biaisés par le centre et le pays de la carte active, sans empêcher
une recherche mondiale. La clé `VITE_STADIA_MAPS_API_KEY` reste optionnelle
pour l'authentification par domaine, n'est jamais stockée localement et est
visible au navigateur comme toute variable `VITE_*`.

Le résultat sélectionné ajoute un marqueur temporaire doré, conserve les POI
existants et permet d'ouvrir la création d'un POI avec nom et coordonnées
préremplis. Aucun POI n'est enregistré avant la validation du formulaire.

## Lancement local

Dans un premier terminal, démarrez le backend depuis `backend` :

```powershell
python -m uvicorn app.main:app --reload
```

Dans un second terminal, depuis `frontend` :

```powershell
npm run dev
```

Vite affiche l'URL locale, généralement <http://localhost:5173>. Le backend
autorise explicitement les origines `localhost:5173` et `127.0.0.1:5173` par
défaut via `CORS_ALLOWED_ORIGINS`.

## Scripts

```powershell
npm run dev
npm run lint
npm run test
npm run build
npm run preview
```

## Fonctionnement

- la carte constitue l'écran principal permanent pour la consultation et la gestion des POI ;
- la barre supérieure centralise le pays actif, l'ajout d'un POI et l'accès à l'administration ;
- une liste fixe à gauche affiche les POI du pays actif, avec recherche serveur et pagination par 100 éléments ;
- un unique volet latéral propose successivement les modes aperçu, détails, création et modification ;
- position initiale : latitude `48.17`, longitude `6.45`, zoom `9` ;
- fonds Stadia Maps ou OpenStreetMap avec attribution ;
- appel de `GET /places/map` avec les limites visibles et le pays actif ;
- délai de 350 ms après les déplacements et changements de zoom ;
- annulation des appels obsolètes avec `AbortController` ;
- limite de 1 000 marqueurs par requête ;
- affichage des catégories, tags et coordonnées sans appel de détail lors du simple aperçu ;
- lien « Ouvrir dans Google Maps » construit uniquement à partir des coordonnées, sans clé API.

Les pays proposés sont extraits des valeurs non vides réellement retournées
par `GET /places`, parcouru par pages de 100. Les doublons sont supprimés sans
tenir compte de la casse. Le pays actif est conservé dans `?country=`, ce qui
rend le filtre partageable et compatible avec le rechargement et l'historique
du navigateur.

La liste de gauche utilise `GET /places?country=...&q=...&limit=100&offset=...`.
Elle trie les résultats chargés alphabétiquement, propose « Charger plus »
tant qu'une page complète est reçue et ne charge aucune photo. Un clic dans la
liste ouvre le même aperçu qu'un marqueur et recentre la carte si les
coordonnées existent. Inversement, un marqueur sélectionne et révèle l'entrée
correspondante dans la liste.

## Routes

- `/` affiche la carte seule ou l'aperçu local du marqueur sélectionné ;
- `/places/new` affiche la carte et le formulaire de création dans le volet ;
- `/places/:placeId` affiche la carte et charge la fiche complète avec ses photos dans le volet ;
- `/places/:placeId/edit` affiche la carte et le formulaire de modification dans le volet ;
- `/admin` redirige vers l'administration des catégories ;
- `/admin/categories` gère la recherche et le CRUD des catégories ;
- `/admin/tags` gère la recherche et le CRUD des tags.

Le clic sur un marqueur ouvre un aperçu sans modifier l'URL. Le bouton
« Fiche » ouvre ensuite la route détaillée partageable. Les URL de détail,
création et modification fonctionnent aussi en accès direct : la carte reste
montée derrière le même volet. La fermeture revient vers `/` sans recharger
l'application et le retour du navigateur reste utilisable. Le centre, le
zoom, les limites, les marqueurs chargés et la sélection sont conservés lors
des changements de mode.

Après une création ou une modification, l'application ouvre la fiche du POI
dans le volet et actualise les marqueurs visibles. Après une suppression, elle
ferme le volet, revient à `/` et retire immédiatement le marqueur local.

Sur ordinateur, le volet réduit la largeur disponible pour la carte ; Leaflet
est alors redimensionné sans modifier le zoom. Le panneau de liste peut être
masqué depuis la barre supérieure. Sur tablette et mobile, liste et détails
deviennent des panneaux superposés ; la liste est masquée pendant l'affichage
des détails afin d'éviter trois zones concurrentes. Les panneaux conservent
une fermeture visible et un défilement interne.

La sélection de `France`, seule valeur actuellement présente dans les données
de développement, utilise temporairement un centre et un zoom définis dans le
frontend. Les pays inconnus utilisent un cadrage mondial sûr. Cette
configuration est volontairement transitoire : une prochaine évolution doit
normaliser les pays avec code ISO, centre, zoom et limites en base.

La fiche charge séparément `GET /places/{placeId}` et
`GET /places/{placeId}/photos`. Les images utilisent exclusivement
`GET /photos/{photoId}/file` : le champ de stockage `path` n'est jamais
transformé en URL côté navigateur.

Le formulaire partagé couvre tous les champs exposés par l'API. La position
peut être saisie, choisie par un clic sur la carte ou ajustée en déplaçant le
marqueur. En modification, seuls les champs changés sont envoyés ; les
catégories et tags sont synchronisés par différence. En création, le POI est
créé avant ses associations : si une association échoue, la fiche créée est
conservée et un lien permet de la retrouver.

L'administration interroge les recherches backend avec un délai de 300 ms et
affiche explicitement les conflits, notamment l'unicité des noms de tags. La
suppression d'une catégorie ou d'un tag retire aussi ses associations aux POI
grâce aux cascades de la base. Le formulaire POI recharge ces référentiels à
chaque ouverture et ne conserve donc pas de cache global obsolète.

## Limites de cette version

- aucune authentification ni restriction d'accès à l'administration ;
- les icônes, couleurs et aperçus de marqueur des catégories restent prévus
  pour une évolution ultérieure ;
- aucun filtre visible par catégorie ou tag, même si le client API accepte ces
  paramètres ;
- aucun clustering de marqueurs ;
- pays non normalisés et cadrage détaillé configuré uniquement pour la France ;
- le compteur de liste représente les éléments chargés, l'API ne fournissant pas encore de total ;
- aucune recherche d'adresse ou interaction par clic droit ;
- aucun upload photo ni authentification.
# Catalogue de cartes

La navigation commence par **Cartes** (catalogue), puis **Lieux**. Fermer un panneau, ou cliquer une seconde fois sur son entrée active, rend la carte seule sans introduire une entrée de navigation dédiée. Le catalogue affiche les cartes de `GET /maps` dans le panneau latéral : aperçu CSS local, nom, pays, recherche locale, état actif, ouverture et suppression. Le bouton « Créer une carte » ouvre la modale existante ; après création ou ouverture, la carte active est sélectionnée et le panneau Lieux est affiché. Le changement ne remonte pas `MapContainer` et conserve le fond choisi.
