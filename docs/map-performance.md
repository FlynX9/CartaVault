# Performances et scalabilité de la carte

Ce document accompagne l’issue #83. Les mesures doivent être effectuées sur
des données synthétiques ou une copie dédiée, jamais en injectant des données
de benchmark dans la production.

## Audit de l’architecture actuelle

- `GET /places/map` est distinct de la liste et des fiches détaillées.
- PostgreSQL limite les résultats aux bounds via
  `ST_Intersects(location, ST_MakeEnvelope(...))`. L’index GiST
  `places_location_idx` couvre cette recherche.
- Le payload marqueur contient uniquement : identifiants du POI et de la
  carte, nom, coordonnées, identifiant/couleur du statut, icône de catégorie
  principale, identifiants des catégories et tags nécessaires au filtrage, et
  favori. Les descriptions, liens, médias, champs personnalisés, libellés
  d’associations, notes et métadonnées de fiche sont exclus.
- Les détails complets sont chargés uniquement après sélection du POI.
- Leaflet utilise des marqueurs DOM pour les marqueurs et clusters, des
  couches Canvas/SVG pour les tracés de sortie, et MapLibre ou des tuiles
  Leaflet pour les fonds selon le mode choisi.
- Le clustering client regroupe les coordonnées projetées par cellules de
  64 px en temps linéaire. Les icônes de marqueurs et de clusters sont mises
  en cache.
- Au-delà de 750 points à rendre, le clustering reste actif même au zoom
  maximal afin d’éviter des milliers de nœuds DOM permanents.
- `MapContainer` reste monté lors de l’ouverture, de la fermeture ou du
  redimensionnement des panneaux. Centre, zoom, sélection, popup, filtres et
  sortie active sont donc conservés.

## Chargement par zone visible

Les bounds sont publiées après `moveend` et `zoomend`. Les doublons Leaflet et
les variations inférieures à 6 % de la taille de la zone précédemment publiée
sont ignorés ; les petits déplacements restent cumulatifs et finissent donc
par déclencher un rafraîchissement.

Les appels métier sont :

- différés de 250 ms après le dernier changement significatif ;
- limités à 2 000 marqueurs côté application, avec un plafond API de 5 000 ;
- annulés lorsque la carte, les bounds ou les filtres changent ;
- protégés par un numéro de séquence contre une réponse obsolète ;
- effectués en arrière-plan sans effacer les derniers marqueurs utilisables ;
- indépendants des erreurs de chargement des tuiles.

Une réponse identique conserve la référence du tableau précédent. Leaflet ne
réconcilie donc pas les marqueurs et clusters pour un rafraîchissement sans
changement réel.

## Rendu, filtres et redimensionnement

Les propriétés visibles du marqueur sont comparées explicitement. Les
callbacks de sélection sont stabilisés par référence, afin qu’un changement
d’état sans rapport ne rende pas à nouveau tous les marqueurs.

Le filtrage détaillé est appliqué côté serveur au chargement des bounds. Le
filtre léger de la liste est aussi appliqué immédiatement côté client pour
atténuer les marqueurs non correspondants pendant les 250 ms de debounce.

Les changements de taille utilisent au maximum une invalidation Leaflet par
frame d’animation pendant un drag, puis une invalidation finale bornée après
la transition de panneau. La largeur n’est persistée qu’à la fin du drag.

## Mesures déterministes

Le test `mapClusterUtils.test.ts` génère toujours la même distribution et
mesure 500, 2 000 et 10 000 marqueurs. Il impose une limite conservatrice de
250 ms par regroupement, très supérieure aux temps observés localement, afin
de détecter une régression algorithmique sans rendre la CI fragile.

Référence relevée le 30 juillet 2026 sur le poste de développement :

| Marqueurs | Clusters | Calcul |
| ---: | ---: | ---: |
| 500 | 8 | 0,25 ms |
| 2 000 | 8 | 0,66 ms |
| 10 000 | 16 | 1,70 ms |

Ces valeurs mesurent uniquement le regroupement déterministe, pas le réseau,
PostgreSQL, Leaflet ni le navigateur. Elles servent de référence comparative,
pas de garantie de latence utilisateur.

Commande :

```sh
cd frontend
npm test -- --run src/components/map/mapClusterUtils.test.ts
```

À relever pour une validation navigateur complète :

- délai d’affichage initial et taille de `GET /places/map` ;
- fluidité pan/zoom et changement de filtres ;
- ouverture, fermeture et redimensionnement des panneaux ;
- sélection d’un marqueur, thème et changement de fond ;
- mémoire après dix cycles de navigation ;
- absence de recréation du conteneur Leaflet ;
- présence d’une annulation pour les requêtes de bounds remplacées.

Vérifier les quatre combinaisons principales : clair, sombre, satellite et
OSM. Une erreur de tuile ne doit jamais vider les données métier et une erreur
de marqueurs ne doit jamais être présentée comme une erreur de tuiles.

## Seuil d’agrégation serveur

Le clustering client reste adapté tant que la réponse visible est plafonnée à
2 000 points. Évaluer une agrégation serveur si l’un de ces signaux est
répété sur des données représentatives :

- au moins 5 000 points visibles demandés à faible zoom ;
- payload compressé supérieur à 1 Mo ;
- calcul/réconciliation supérieur à 100 ms au 95e percentile ;
- mémoire ou nombre de nœuds DOM dégradant la navigation.

L’architecture future recommandée est une route par bounds et niveau de zoom
retournant des cellules ou clusters avec identifiant opaque, centroïde,
compteur et bounds d’expansion. À zoom élevé ou sous le seuil, elle retourne
les marqueurs minimaux existants. La requête d’agrégation doit partir de la
même sous-requête d’autorisation que les POI individuels : aucun compteur ne
doit inclure une carte inaccessible. Le cache éventuel doit inclure
l’utilisateur, les cartes autorisées, les filtres, le zoom et la cellule, avec
une invalidation mesurée.

## Couverture automatisée

Les tests couvrent le payload minimal, les bounds significatives, le debounce,
l’annulation et le rejet des réponses obsolètes, la conservation des données
pendant une erreur, les filtres, le clustering aux fortes cardinalités, la
sélection, la persistance du conteneur Leaflet, le redimensionnement borné et
les permissions de l’endpoint.
