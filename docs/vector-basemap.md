# Fonds vectoriels CartaVault par pays

CartaVault peut préparer automatiquement les fonds vectoriels OpenStreetMap nécessaires aux pays utilisés par l’instance. Le workflow normal ne demande ni archive PMTiles, ni commande Planetiler, ni version saisie manuellement.

## Architecture

L’architecture officielle conserve deux conteneurs permanents : `cartavault` et `postgis`. Planetiler OpenMapTiles 3.16 et Java 21 sont intégrés à l’image CartaVault ; Planetiler est uniquement lancé comme processus enfant pendant une préparation. Il n’est ni un service permanent, ni un troisième conteneur.

Les archives partagées par toute l’instance résident dans le volume persistant `/data/maps` :

```text
/data/maps/
├── france.pmtiles
├── italy.pmtiles
├── monaco.pmtiles
└── work/
    └── sources/  # ressources OpenMapTiles communes réutilisées
```

Le conteneur embarque aussi les glyphes `Noto Sans Regular` et `Noto Sans Italic`. L’administrateur n’a rien à copier dans `fonts/`.

## Activation et politique

Ouvrez **Administration → Général → Fond de carte CartaVault** puis activez le switch. Choisissez une politique :

- **À la création d’une carte** : la première carte du pays planifie la préparation ; la création reste immédiate ;
- **À la première utilisation du fond CartaVault** (valeur par défaut) : le job démarre lorsque le fond clair ou sombre est sélectionné ;
- **Lors du premier téléchargement hors ligne** : le job démarre à la préparation du premier package du pays ;
- **Manuellement** : seul un administrateur lance l’installation.

Les réglages de zoom, marge offline, limite de tuiles et fréquence de mise à jour sont persistés en base. Ils ne sont plus des options fonctionnelles `.env`.

## Bibliothèque Admin

La même section liste les fonds et leurs états : non installé, téléchargement, génération, validation, disponible, mise à jour disponible, erreur ou suppression. Un administrateur peut :

- sélectionner un pays du catalogue contrôlé et cliquer sur **Télécharger et préparer** ;
- mettre à jour un fond sans interrompre l’archive actuelle ;
- annuler ou réessayer un traitement ;
- supprimer un fond après avoir vu le nombre de cartes qui l’utilisent.

La liste Admin reprend les 250 destinations du catalogue mondial utilisé lors de la création d’une carte. Les URL Geofabrik et noms de fichiers proviennent exclusivement du catalogue interne `backend/app/basemaps/vector_catalog.py` : 192 destinations disposent actuellement d’un extrait officiel compatible. Les autres restent visibles avec l’état « indisponible » et ne peuvent pas lancer de téléchargement. Aucun texte ou URL fourni par un utilisateur n’est transmis au réseau ou à Planetiler.

## Cycle de préparation

1. CartaVault effectue un HEAD contrôlé vers l’extrait Geofabrik et vérifie l’espace libre.
2. Le PBF est téléchargé dans `work/<pays>.osm.pbf.part`.
3. Après téléchargement complet, un renommage atomique produit `<pays>.osm.pbf`.
4. Planetiler/OpenMapTiles génère `work/<pays>.tmp.pmtiles` avec une liste d’arguments, sans shell.
5. CartaVault valide le header PMTiles v3, le format MVT, la plage de zoom, les métadonnées et, lorsqu’elles sont présentes, les couches OpenMapTiles principales.
6. `os.replace()` active atomiquement `<pays>.pmtiles`. Pendant une mise à jour, l’ancien fichier reste donc servi jusqu’à cette étape.
7. Le PBF source est supprimé après succès.

Les jobs sont persistés en base. Une contrainte unique déduplique un pays et un verrou consultatif PostgreSQL limite l’instance à une génération coûteuse à la fois, y compris avec plusieurs processus backend. Au redémarrage, un job réellement interrompu passe en erreur `INTERRUPTED`; un job encore en attente est relancé.

Codes d’erreur stables : `DOWNLOAD_FAILED`, `INSUFFICIENT_DISK`, `GENERATION_FAILED`, `PMTILES_INVALID`, `UNSUPPORTED_COUNTRY`, `INTERRUPTED`, `CANCELLED`.

## Utilisation online et offline

En ligne, MapLibre lit uniquement les plages utiles de `/api/basemaps/cartavault/archive/<pays>.pmtiles` avec HTTP Range (`206`, `Accept-Ranges`, `Content-Range`, ETag). Le navigateur ne télécharge pas l’archive complète.

Il n’existe plus de source vectorielle distante cachée :

```text
ONLINE  : CartaVault → PMTiles local serveur
OFFLINE : CartaVault → tuiles de zone dans IndexedDB
```

Lors d’un téléchargement offline, CartaVault calcule l’emprise des POI, étapes, nuitées et géométries, ajoute la marge configurée, puis extrait seulement les tuiles nécessaires aux zooms configurés. Les tuiles communes sont dédupliquées dans IndexedDB. Si le fond pays n’est pas prêt, aucun package incomplet et aucune tuile Google/OSM de substitution ne sont enregistrés ; l’interface indique que le fond est en préparation.

OSM Standard est le fallback explicite pendant la préparation ou en cas d’erreur. Google, Stadia, OSRM, Google Routes, Google Places, les POI et les sorties ne sont pas modifiés par ce service.

## Ressources et stockage

Planetiler recommande typiquement au moins 5 à 10 fois la taille du PBF en espace temporaire et environ la moitié de sa taille en RAM. CartaVault réserve une marge de 12 fois la taille annoncée du PBF et refuse de démarrer si l’espace est manifestement insuffisant. La JVM utilise par défaut `-Xmx2g`, ajustable comme paramètre d’infrastructure avec `CARTAVAULT_PLANETILER_JAVA_HEAP`. Sur une installation native, `CARTAVAULT_JAVA_EXECUTABLE` permet de cibler explicitement un runtime Java 21 sans modifier le Java système.

Le volume `vector_maps_data` est persistant dans Compose. Pour Portainer/NAS, `/data/maps` est un bind mount inscriptible sous `${CARTAVAULT_DATA_ROOT}/maps`. Sa sauvegarde évite de régénérer les fonds après restauration.

## Mises à jour

La mise à jour automatique peut être désactivée, mensuelle ou trimestrielle. Elle n’est pas quotidienne. Lorsque la date `Last-Modified` Geofabrik n’a pas changé, le job termine sans régénération. La version est calculée automatiquement, par exemple `fr-2026-08-15-omt-3.16`, et reste enregistrée dans les métadonnées des packages offline afin de détecter les mises à jour.

## Validation réelle avec Monaco

Monaco permet de tester le pipeline sans générer immédiatement la France :

1. Construire/démarrer la stack officielle et ouvrir Administration → Général.
2. Activer CartaVault et choisir **À la création d’une carte**, ou installer Monaco manuellement.
3. Créer/ouvrir une carte Monaco et suivre `Téléchargement → Génération → Validation → Disponible`.
4. Sélectionner CartaVault clair, puis sombre ; vérifier routes, labels, glyphes, zoom et attribution `© OpenStreetMap contributors · OpenMapTiles · CartaVault`.
5. Ajouter des POI et une sortie avec géométrie sauvegardée.
6. Télécharger la carte ou la sortie depuis son action offline.
7. Activer le mode avion, recharger l’application, vérifier le pan/zoom dans l’emprise, les POI et l’itinéraire sauvegardé.
8. Revenir en ligne et vérifier que le provider choisi avant le mode offline est restauré.

Validation technique réalisée le 15 août 2026 avec l’image officielle construite localement : le PBF Geofabrik Monaco de 689 377 octets a produit en 2 min 5 s une archive PMTiles v3 MVT, zooms 0–14, métadonnées OpenMapTiles 3.16.0 et 15 couches dont `transportation`, `water`, `place`, `building` et `poi`. Le premier lancement a aussi téléchargé les ressources OpenMapTiles communes ; celles-ci sont conservées dans le volume et réutilisées. L’archive a ensuite passé le validateur backend CartaVault. La vérification visuelle et le scénario mode avion restent à exécuter depuis un navigateur/appareil sur une stack déployée.

Ne lancez pas une génération France pour un simple test d’intégration : l’extrait et les besoins temporaires sont beaucoup plus importants.

## Mode avancé local

Le workflow pris en charge est l’installation automatique. Un exploitant peut toutefois déposer une archive OpenMapTiles déjà validée sous le nom contrôlé du catalogue dans `/data/maps` puis l’enregistrer via la base/API interne ; aucun endpoint n’accepte de chemin ou d’URL arbitraire. Cette compatibilité avancée ne remplace pas l’installation Admin.

## Attribution

Les styles clair et sombre affichent toujours **© OpenStreetMap contributors · OpenMapTiles · CartaVault**, en ligne comme hors ligne. La marque CartaVault ne remplace pas l’attribution des données et du schéma.
