# Provenance des données de démonstration

## Données fonctionnelles

Tous les noms de personnes, cartes, sorties, POI, descriptions et adresses présents dans l’instance sont fictifs et ont été créés pour CartaVault. Les coordonnées sont des points synthétiques répartis autour de six centres régionaux publics. Elles ne prétendent pas désigner les établissements nommés.

La date de référence est fixée au **15 juin 2026 à 09:00**. Les UUID sont dérivés d’un namespace constant ; deux resets produisent donc les mêmes identifiants et les mêmes relations.

## Médias et fond cartographique

Six illustrations abstraites sont générées localement par `scripts/manage.py`. Elles sont une création propre au projet CartaVault, ne reprennent aucune œuvre ni photographie tierce et peuvent être réutilisées avec le code du projet. Les autres POI conservent volontairement l’état « sans photo ».

Les captures Playwright remplacent les appels aux tuiles externes par un fond local neutre ; aucune tuile OpenStreetMap, Stadia Maps ou Google n’est redistribuée.

Toute future ressource ajoutée à `demo/assets/` doit être enregistrée ici avec : auteur, URL source, licence, URL de licence, date de vérification et éventuelles modifications. Seules les licences domaine public, CC0 et CC BY sont acceptées par défaut.
