# Frontend cartographique de POI Manager

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
```

L'URL est normalisée par `src/config.ts`, afin qu'une barre oblique finale ne
produise pas de doubles `/` dans les appels API.

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
- un unique volet latéral propose successivement les modes aperçu, détails, création et modification ;
- position initiale : latitude `48.17`, longitude `6.45`, zoom `9` ;
- fond OpenStreetMap avec attribution ;
- appel de `GET /places/map` avec les limites visibles ;
- délai de 350 ms après les déplacements et changements de zoom ;
- annulation des appels obsolètes avec `AbortController` ;
- limite de 1 000 marqueurs par requête ;
- affichage des catégories, tags et coordonnées sans appel de détail lors du simple aperçu ;
- lien « Ouvrir dans Google Maps » construit uniquement à partir des coordonnées, sans clé API.

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
est alors redimensionné sans modifier le zoom. Sur mobile, le volet devient un
panneau superposé occupant la majorité de la largeur, avec fermeture visible
et défilement interne.

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
- aucune recherche d'adresse, vue satellite ou interaction par clic droit ;
- aucun upload photo ni authentification.
