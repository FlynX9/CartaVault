# Provenance des données de démonstration

## Données fonctionnelles

Tous les noms de personnes, cartes, sorties, POI, descriptions et adresses présents dans l’instance sont fictifs et ont été créés pour CartaVault. Les coordonnées sont des points synthétiques répartis autour de six centres régionaux publics. Elles ne prétendent pas désigner les établissements nommés.

La date de référence est fixée au **15 juin 2026 à 09:00**. Les UUID sont dérivés d’un namespace constant ; deux resets produisent donc les mêmes identifiants et les mêmes relations.

## Médias, itinéraires et fond cartographique

Les 30 POI français disposent chacun d’une illustration originale générée pour CartaVault, puis recadrée en WebP 480 × 320. Ces scènes représentent des lieux fictifs : elles ne reprennent aucune photographie, œuvre, enseigne ou marque tierce. Les fichiers maîtres utilisés par la démo sont versionnés dans `assets/places/` et peuvent être réutilisés avec le code du projet. Les POI italiens conservent volontairement l’état « sans photo » puisqu’ils ne font pas partie du scénario de captures de référence.

Lors d’un reset, `scripts/manage.py` vérifie d’abord que les 30 ressources sources sont présentes, puis en copie une dans le stockage applicatif de chaque POI français. Le reset ne modifie et ne supprime jamais `assets/places/` ; il ne fait que reconstruire les enregistrements et copies d’exécution.

Les géométries routières de la sortie française ont été calculées le 5 août 2026 avec le serveur public du projet OSRM à partir des données OpenStreetMap, puis simplifiées et figées dans `data/route_geometries.json`. Elles ne déclenchent donc aucun appel de routage pendant un reset ou une capture. L’attribution OpenStreetMap reste visible sur la carte conformément à l’ODbL.

Les captures chargent le fond OpenFreeMap configuré par CartaVault. Les tuiles ne sont ni intégrées au dépôt ni redistribuées ; chaque PNG conserve les attributions OpenFreeMap, OpenMapTiles et OpenStreetMap affichées par l’application.

Toute future ressource ajoutée à `demo/assets/` doit être enregistrée ici avec : auteur, URL source, licence, URL de licence, date de vérification et éventuelles modifications. Seules les licences domaine public, CC0 et CC BY sont acceptées par défaut.
