# Frontend cartographique de CartaVault

La section **Administration → État de l’instance** affiche la santé globale, les services, l’usage, la sécurité, la maintenance, les sauvegardes connues et les erreurs contrôlées. Les états sont accompagnés d’un libellé et d’une icône, y compris sur mobile. Voir [`../docs/instance-status.md`](../docs/instance-status.md).

Le bouton utilisateur ouvre une grande modale Compte au-dessus du workspace, sans remonter Leaflet. Elle regroupe Profil, Sécurité, Sessions actives, Préférences et Zone sensible. Pour un administrateur, l’entrée Administration du sous-menu utilisateur ouvre séparément la console protégée `/admin`. Les préférences restent associées au compte ; l’avatar utilise les initiales comme fallback.

## Authentification et partage privé

Au démarrage, `AuthProvider` restaure la session avec `/auth/me`. Aucun token
d’authentification n’est placé dans `localStorage` : le client central envoie le
cookie avec `credentials: "include"` et ajoute automatiquement le token CSRF aux
écritures. Une session expirée réinitialise l’état utilisateur et revient à la
connexion sans boucle de requêtes.

Les routes publiques `/register`, `/forgot-password` et `/reset-password` complètent la connexion. Une inscription reste en attente jusqu’à la décision d’un administrateur. Le panneau Utilisateurs présente les demandes et permet de saisir la clé Resend, qui n’est jamais conservée dans le navigateur ni relue en clair. La réponse d’oubli de mot de passe reste identique, que l’adresse existe ou non.

Le catalogue affiche le rôle courant et adapte les actions aux permissions
renvoyées par l’API. Un lecteur consulte et exporte ; un éditeur gère le contenu
et importe ; un propriétaire gère aussi les membres, invitations, suppression et
transfert. L’administration des utilisateurs n’est visible que pour un
administrateur global. Les invitations utilisent un lien copiable : aucun e-mail
n’est envoyé. La route `/invitations/:token` permet la connexion d’un compte
existant ou la création contrôlée du compte correspondant à l’adresse invitée.

L’entrée **Admin** ouvre la gestion des utilisateurs dans le même panneau
latéral flottant que Cartes, Lieux, Catégories, Tags et Statuts, sans démonter la
carte. Le panneau Statuts reste une rubrique autonome : il n’est pas dupliqué
dans l’administration globale.

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

La confirmation affiche une barre de progression pour la création des POI et
le traitement des images. Les URL Google My Maps identiques sont mutualisées ;
une image indisponible est signalée dans le rapport sans interrompre l’import.
Les doublons internes et ceux déjà présents sur la carte sont identifiés
séparément. L’action « Forcer tous les doublons » les sélectionne en une fois,
sans inclure les entrées géographiquement invalides.

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

Interface React TypeScript de CartaVault. Elle affiche les POI visibles sur
une carte Leaflet, présente un aperçu au clic et permet de consulter, créer,
modifier et supprimer les POI et leurs associations.

## Prérequis

- Node.js 24 (développement vérifié avec Node.js 24.18.0) ;
- npm ;
- le backend CartaVault accessible en HTTP.

## Installation

Depuis `frontend` :

```powershell
npm install
Copy-Item .env.example .env
```

Le fichier `.env` local est ignoré par Git. La variable disponible est :

```dotenv
VITE_API_BASE_URL=
VITE_STADIA_MAPS_API_KEY=
VITE_BASEMAP_LIGHT_ENABLED=true
VITE_BASEMAP_DARK_ENABLED=true
VITE_BASEMAP_SATELLITE_ENABLED=true
VITE_BASEMAP_OSM_ENABLED=true
```

Laisser `VITE_API_BASE_URL` vide en développement utilise `/api`. Le proxy Vite
transmet ces requêtes à `http://127.0.0.1:8000` tout en conservant, côté
navigateur, la même origine que l’interface. Le cookie de session
`SameSite=Lax` est ainsi transmis que Vite soit ouvert avec `localhost` ou
`127.0.0.1`. Une URL explicite reste prioritaire et doit être configurée pour
un déploiement sans reverse proxy `/api`. Elle est normalisée par
`src/config.ts` afin qu’une barre oblique finale ne produise pas de doubles `/`.

## Fonds cartographiques

La carte principale propose CartaVault clair et sombre (styles vectoriels locaux
dérivés d'OpenFreeMap Positron), Satellite (source raster historique) et
OpenStreetMap Standard. Chaque entrée peut être masquée des sélecteurs avec la variable
`VITE_BASEMAP_*_ENABLED` correspondante, sans modification du code. Le choix
explicite est associé au compte ; `cartavault.basemap` sert de repli local si
les préférences distantes sont indisponibles. Sans choix explicite, CartaVault
utilise le fond clair ou sombre cohérent avec le thème. Un changement de fond
ne recrée pas la carte et conserve centre, zoom, marqueurs, tracés et outils.

Le POC conserve Leaflet et rend uniquement le fond vectoriel avec MapLibre via
`@maplibre/maplibre-gl-leaflet`. Cette option est plus adaptée qu'un raster pour
masquer les commerces et équipements secondaires et maintenir deux thèmes sans
filtre CSS. Les styles revus sont servis localement depuis `public/map-styles` ;
les tuiles vectorielles et glyphes proviennent par défaut de l'instance publique
OpenFreeMap, sans compte ni clé API. Les marqueurs, clusters, popups et tracés
CartaVault restent des couches Leaflet au-dessus du fond.

Les URL sont configurables avec `VITE_BASEMAP_LIGHT_STYLE_URL`,
`VITE_BASEMAP_DARK_STYLE_URL`, `VITE_OPENFREEMAP_TILEJSON_URL` et
`VITE_OPENFREEMAP_GLYPHS_URL`. `VITE_BASEMAP_OSM_URL` contrôle le secours raster
OpenStreetMap Standard. La couche satellite historique reste indépendante via
`VITE_BASEMAP_SATELLITE_URL` et peut encore nécessiter
`VITE_STADIA_MAPS_API_KEY` si elle pointe vers Stadia. Les variables `VITE_*`
sont publiques : ne jamais y placer un secret non restreint.

L'attribution « OpenFreeMap © OpenMapTiles Data from OpenStreetMap » reste
visible. L'instance publique OpenFreeMap n'annonce ni quota ni facturation, mais
ne fournit pas de SLA. Avant une exploitation nécessitant une garantie de
service, le même style local pourra pointer vers une instance OpenFreeMap
auto-hébergée. Une évolution PMTiles demandera un protocole/source MapLibre
adapté, sans migration des marqueurs Leaflet. Le pont Leaflet/MapLibre ne prend
pas en charge rotation, inclinaison et pitch et est moins performant qu'une
carte MapLibre autonome ; ces fonctions ne sont pas requises par ce POC.

Après trois erreurs de tuiles successives sur un fond, CartaVault bascule une
seule fois vers OpenStreetMap et affiche un message discret. Une erreur OSM ne
provoque jamais une boucle de basculement. Ce repli de session ne remplace pas
le choix explicite conservé dans le compte.

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

## Compte

Le menu utilisateur ouvre la modale **Compte** au-dessus de Leaflet. Elle
propose les sections Profil, Avatar, Sécurité, Sessions, Préférences,
Administration pour les administrateurs et Zone sensible. Les préférences sont
persistées avec le compte ; la préférence de fond cartographique est appliquée
sans recharger l’application.

## Mode Sorties

Le mode **Sorties** n’est pas une modale. Il conserve le panneau Lieux à gauche, le `MapContainer` principal au centre et ouvre le planificateur à droite. Les POI disponibles deviennent déplaçables vers une journée ; ceux déjà utilisés sont signalés dans la liste. La carte principale superpose les tracés, les étapes numérotées et les nuits, en mettant la journée active en évidence.

Le panneau droit permet de créer et sélectionner une sortie, organiser ses journées et étapes, ajouter un lieu libre ou un hébergement, calculer ou optimiser un itinéraire, suivre les visites et lancer les exports. Sur écran étroit, les panneaux utilisent le comportement responsive commun aux autres espaces de travail.

Chaque journée affiche séparément route, conduite, visites, tampon entre étapes, marge de sécurité et durée totale estimée. Aucune pause n’est ajoutée au modèle ou au calcul. La configuration horaire accepte une arrivée cible, un départ planifié, un tampon et une marge fixe ou en pourcentage ; elle affiche le départ recommandé, l’arrivée estimée, leur éventuel décalage de jour et l’avance ou le retard.

Les durées de visite proposent des préréglages (15 à 120 minutes) et une valeur personnalisée. Le voyage possède des seuils et couleurs de charge configurables, réinitialisables aux valeurs CartaVault de 4 h / 8 h. Le résumé global totalise séparément conduite, visites, tampon et marges et compte les journées par niveau de charge. Une journée non calculée ou obsolète affiche un état explicite et rend le résumé partiel jusqu’au prochain calcul.
# Préférence de routage

La fenêtre **Compte > Préférences** permet d’activer **Rester dans le pays**. Le module Sortie distingue alors une route validée, à vérifier, refusée ou indisponible. Une erreur `ROUTE_LEAVES_COUNTRY` est affichée avec un message français lisible ; aucune géométrie refusée n’est présentée comme itinéraire actif.
# Performance de la carte

Les POI visibles sont regroupés par une grille locale légère, sans service externe ni dépendance Leaflet supplémentaire. Les clusters excluent les marqueurs fonctionnels. Les panneaux, export KMZ, membres, sorties et administration sont chargés à la demande; Vite sépare React, Leaflet et Iconify en chunks cacheables.
# Filtres et sélection multiple

Le panneau Lieux conserve le clic de ligne pour la consultation. Le bouton de sélection active des cases indépendantes et une barre d’actions pour la page visible : changement de statut ou suppression confirmée. Les sélections ne signifient jamais « tous les résultats » ; le libellé indique explicitement la page courante.
# Routage des sorties

La section **Compte → Préférences → Routage** permet de choisir OSRM ou Google Routes. OSRM reste disponible sans clé. Google reste visible mais désactivé jusqu’à ce que l’utilisateur ajoute puis vérifie sa clé personnelle. Le formulaire permet de l’afficher uniquement avant soumission, puis la vide ; l’API ne renvoie ensuite que son suffixe masqué et ses métadonnées. Remplacer une clé impose une nouvelle vérification. La suppression demande le mot de passe actuel et replace le moteur sur OSRM sans supprimer les itinéraires existants. La vérification consomme un appel Google Routes API.

La clé personnelle n’est enregistrée ni dans l’URL, ni dans `localStorage`/`sessionStorage`, ni dans les préférences frontend. Ses options (péages, autoroutes, ferries et trafic) ne sont affichées que lorsque Google est sélectionné. Le module Sorties affiche le moteur mémorisé avec chaque itinéraire et signale lorsqu’il diffère de la préférence actuelle.
## Lieux avancés

- Les paramètres d’une carte permettent d’afficher ou masquer les champs facultatifs des fiches POI.
- Le panneau Lieux filtre les favoris, les lieux visités et la note minimale, et trie côté serveur sans casser la pagination.
- La fiche propose le favori, les deux notations, les liens externes sécurisés et l’historique.
- La corbeille est accessible dans les filtres avancés pour les éditeurs ; elle permet la restauration ou une purge explicitement confirmée.
- Un viewer conserve un accès en lecture aux valeurs et à l’historique, sans action de modification.

## Statuts et filtres de visite

La barre principale du panneau Lieux est volontairement stable : **Tous**,
**Non visités**, **Visités** et **Favoris**. Elle n’encode aucun nom de statut
personnalisé. Les deux états de visite proviennent de
`status.functional_state`; Favoris est une dimension indépendante et peut être
combinée avec eux.

Le panneau de filtres avancés liste les statuts réels de la carte, leur couleur
et leurs compteurs. Plusieurs statuts sont combinés par `OR`; catégories, tags,
état fonctionnel et favoris se combinent par `AND`. La liste et la carte
emploient le même sérialiseur de paramètres, ce qui conserve la synchronisation
avec la pagination et les paramètres d’URL.

La gestion des statuts demande « Non visité » ou « Visité » à la création et à
la modification. Lorsqu’un changement reclasse des lieux existants, CartaVault
affiche leur nombre avant confirmation. Les viewers voient les statuts et les
filtres sans recevoir d’action de modification.
# Console d’administration

La route protégée `/admin` ouvre une grande modale claire au-dessus du workspace cartographique persistant, avec navigation Utilisateurs, Clés API, Quotas et usages, et État de l’instance. L’entrée n’apparaît que dans le sous-menu utilisateur d’un administrateur ; elle a été retirée de la navigation latérale et du panneau Compte. La modale est responsive, navigable au clavier, fermable avec Échap et conserve le thème clair CartaVault tant qu’aucun véritable sélecteur de thème applicatif n’est disponible.
