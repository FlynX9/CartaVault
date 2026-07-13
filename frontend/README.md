# Frontend cartographique de POI Manager

Première interface React TypeScript de POI Manager. Elle affiche les POI
visibles sur une carte Leaflet et présente un aperçu léger au clic sur un
marqueur.

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

## Limites de cette version

- aucun formulaire de création ou de modification ;
- le bouton « Voir la fiche » est volontairement inactif ;
- aucun routing applicatif ;
- aucun filtre visible par catégorie ou tag, même si le client API accepte ces
  paramètres ;
- aucun clustering de marqueurs ;
- aucun upload photo ni authentification.
