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

- position initiale : latitude `48.17`, longitude `6.45`, zoom `9` ;
- fond OpenStreetMap avec attribution ;
- appel de `GET /places/map` avec les limites visibles ;
- délai de 350 ms après les déplacements et changements de zoom ;
- annulation des appels obsolètes avec `AbortController` ;
- limite de 1 000 marqueurs par requête ;
- affichage des catégories, tags et coordonnées sans appel de détail.

## Routes

- `/` affiche la carte et son panneau léger ;
- `/places/new` affiche le formulaire de création ;
- `/places/:placeId` charge la fiche complète et les photos du POI.
- `/places/:placeId/edit` affiche le formulaire de modification.

Le bouton « Voir la fiche » ouvre la route détaillée. Le retour conserve en
mémoire les marqueurs, le POI sélectionné, le centre et le zoom tant que
l'application n'est pas rechargée.

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

## Limites de cette version

- aucune gestion autonome des catégories ou tags dans le frontend ;
- aucun filtre visible par catégorie ou tag, même si le client API accepte ces
  paramètres ;
- aucun clustering de marqueurs ;
- aucun upload photo ni authentification.
