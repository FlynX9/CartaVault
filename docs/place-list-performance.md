# Performances de la liste de lieux

La liste repose sur `@tanstack/react-virtual`, avec huit lignes d’anticipation
de chaque côté. Les POI chargés restent disponibles pour la sélection et les
actions groupées, mais seules les lignes visibles sont montées dans le DOM.
Chaque ligne est mesurée après rendu : noms longs, tags et modes compact ou
étendu peuvent donc avoir des hauteurs différentes sans décaler le défilement.

La taille de page reste fixée à 50. Ce compromis limite la réponse initiale, la
création d’objets React et les requêtes d’images tout en conservant un
chargement continu. Les requêtes en cours sont annulées lorsque les filtres ou
la carte changent, les réponses obsolètes sont ignorées et les données
précédentes restent visibles pendant un rafraîchissement. La recherche textuelle
est appliquée après 300 ms ; les filtres à clic restent immédiats.

Les miniatures réservent 78 × 78 pixels, utilisent le chargement différé et le
décodage asynchrone. Une image indisponible est remplacée par l’icône de
catégorie sans nouvelle tentative en boucle.

## Validation reproductible

`MapPlaceList.test.tsx` utilise des jeux déterministes de 500 et 2 000 POI. Il
vérifie que moins de 50 cartes riches sont montées, ainsi que :

- le chargement de la page suivante ;
- la localisation et le chargement d’un POI sélectionné hors de la page active ;
- la conservation de la ligne sélectionnée pendant le recentrage ;
- le debounce de recherche sans écran vide intermédiaire ;
- la navigation clavier et la conservation du focus ;
- le fallback des miniatures ;
- la sélection multiple et le glisser-déposer vers une sortie.

Pour profiler dans un navigateur, charger successivement 500 puis 2 000 POI et
enregistrer l’ouverture du panneau de filtres avec React DevTools Profiler. Le
nombre d’éléments `.places-place-card` doit rester inférieur à 50 et
l’ouverture du panneau ne doit pas produire un nouveau rendu des lignes lorsque
leur état visible n’a pas changé.
