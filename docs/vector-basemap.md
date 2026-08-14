# Fond vectoriel CartaVault (PMTiles)

CartaVault peut afficher un fond vectoriel auto-hébergé construit à partir de données OpenStreetMap. Le runtime ne télécharge ni ne transforme les données OSM : il lit une archive `.pmtiles` pré-générée avec MapLibre et la bibliothèque PMTiles.

Cette capacité ne change pas les fournisseurs de routage (OSRM, Google Routes), de recherche (dont Google Places), ni les fonds OSM, Stadia et Google déjà disponibles. Les styles clair et sombre utilisent la même archive.

## Installation

1. Placez une archive compatible avec le schéma OpenMapTiles dans un dossier de l’hôte, sous le nom `europe.pmtiles`.
2. Placez les glyphes MapLibre/OpenMapTiles dans `fonts/<fontstack>/<range>.pbf` dans le même dossier. Les styles fournis utilisent `Noto Sans Regular` et `Noto Sans Italic`.
3. Configurez l’instance :

```env
CARTAVAULT_VECTOR_MAP_ENABLED=true
CARTAVAULT_VECTOR_MAP_DIR=/srv/cartavault/maps
CARTAVAULT_VECTOR_MAP_VERSION=cartavault-basemap-2026-08
```

Les stacks Docker officielles montent ce dossier en lecture seule dans `/data/maps`. Le fichier n’est pas copié dans l’image. CartaVault continue à démarrer lorsque l’archive manque ou lorsque la fonction est désactivée : les styles CartaVault clair et sombre restent utilisables en ligne avec leur source vectorielle historique, tandis que le téléchargement hors ligne du fond reste indisponible jusqu’à l’installation du PMTiles.

Variables avancées :

```env
CARTAVAULT_VECTOR_MAP_PATH=/data/maps/europe.pmtiles
CARTAVAULT_VECTOR_MAP_FONTS_PATH=/data/maps/fonts
CARTAVAULT_VECTOR_MAP_MIN_ZOOM=0
CARTAVAULT_VECTOR_MAP_MAX_ZOOM=14
CARTAVAULT_VECTOR_MAP_OFFLINE_MIN_ZOOM=5
CARTAVAULT_VECTOR_MAP_OFFLINE_MAX_ZOOM=14
CARTAVAULT_VECTOR_MAP_OFFLINE_PADDING_KM=20
CARTAVAULT_VECTOR_MAP_OFFLINE_MAX_TILES=25000
```

L’endpoint authentifié sert l’archive avec `Accept-Ranges: bytes` et `206 Partial Content`. PMTiles ne télécharge donc que les plages nécessaires au déplacement et au zoom.

## Mise à jour

Remplacez atomiquement `europe.pmtiles` par la nouvelle archive et modifiez `CARTAVAULT_VECTOR_MAP_VERSION` avant de redémarrer CartaVault. Les paquets existants restent lisibles avec leur version locale ; l’action de mise à jour les reconstruit avec la version courante. Ne générez pas l’archive dans le conteneur CartaVault.

## Mode hors ligne

Le téléchargement d’une carte ou d’une sortie calcule une emprise à partir des POI, nuitées, départ/arrivée et géométries d’itinéraire, puis ajoute la marge configurée. Seules les tuiles de cette emprise et des niveaux de zoom configurés sont enregistrées dans IndexedDB. Les tuiles communes à plusieurs paquets sont dédupliquées et ne sont supprimées que lorsque plus aucun paquet ne les référence.

Le paquet inclut les POI, les informations d’organisation, les annotations, l’itinéraire déjà calculé et les miniatures sélectionnées. Il n’inclut jamais de tuile Google, de clé fournisseur ou de secret. Si le fond online est Google ou un autre fournisseur, CartaVault Vector devient temporairement le fond hors ligne puis la préférence initiale est restaurée à la reconnexion.

Limites hors ligne :

- aucun nouveau calcul OSRM ou Google Routes ; seul l’itinéraire déjà calculé est affiché ;
- aucune recherche Google Places ou recherche géographique distante ;
- navigation limitée à la zone et aux zooms téléchargés ;
- le navigateur doit prendre en charge IndexedDB, Cache Storage, WebGL et un quota suffisant.

Le panneau **Mon compte → Données hors ligne** affiche l’espace, les paquets disponibles et permet leur mise à jour ou suppression. CartaVault demande le stockage persistant lorsque le navigateur le permet et refuse le téléchargement si la zone dépasse la limite ou le quota estimé.

## Attribution

Les styles affichent obligatoirement **© OpenStreetMap contributors**, avec OpenMapTiles et CartaVault pour le schéma et le style. Le nom produit CartaVault ne remplace pas l’attribution des données.
