# Performances de la liste de lieux

La liste utilise une fenêtre virtualisée avec huit lignes d'anticipation de
chaque côté. Les POI déjà chargés restent en mémoire pour la sélection et les
actions groupées, mais seules les lignes visibles sont montées dans le DOM.

La taille de page est fixée à 50 : elle réduit la réponse initiale et le coût de
création des objets tout en gardant le chargement continu imperceptible. Les
requêtes en cours sont annulées lorsque les filtres ou la carte changent ; les
données précédentes restent visibles pendant le rafraîchissement.

## Validation reproductible

Le test `MapPlaceList.test.tsx` vérifie qu'une réponse de 500 POI monte moins
de 50 cartes riches et conserve la sémantique de liste. Il couvre aussi le
chargement de la page suivante. Pour une mesure navigateur, charger 500 puis
2 000 POI, ouvrir le Profiler React pendant l'ouverture des panneaux et vérifier
que les cartes hors fenêtre ne sont pas montées. Les vignettes de liste sont
paresseuses et décodées de façon asynchrone.
