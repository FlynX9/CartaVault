# Performances de la carte

L'endpoint `GET /places/map` ne retourne que les champs nécessaires aux
marqueurs : coordonnées, nom, statut, catégories et tags de filtrage, et les
indicateurs affichés. La catégorie principale est portée par
`categories[].is_primary`; elle n'est pas dupliquée dans le document.

Les requêtes sont limitées à 2 000 marqueurs côté application (5 000 est le
plafond serveur), déclenchées après 250 ms et annulées dès que les limites, les
filtres ou la carte changent. Les marqueurs précédents restent affichés pendant
la requête suivante. Si la réponse est identique, sa référence n'est pas
remplacée : Leaflet ne reconstruit donc pas les marqueurs ni les clusters.

Le regroupement est calculé à partir de cellules de 64 px et les icônes de
clusters sont mises en cache. Le composant Leaflet reste monté lors du
redimensionnement des panneaux ; seule sa taille est invalidée.

## Seuil d'agrégation serveur

Le regroupement actuel est volontairement côté client jusqu'à 2 000 résultats
visibles. Si les usages exigent régulièrement plus de 2 000 marqueurs visibles,
ajouter un mode d'agrégation serveur (clusters par tuile et niveau de zoom) :
il devra renvoyer des clusters avec compteur et limites, plutôt que des POI
individuels. Conserver alors l'endpoint actuel pour les zooms où le nombre de
POI est sous le seuil.

## Vérification

Exécuter `npm run test -- --run src/components/map` pour les régressions de
clustering et de stabilité des données de marqueurs, puis simuler un déplacement
rapide de carte dans le navigateur : seule la dernière requête doit aboutir.
