# Validation du pays des POI

CartaVault compare les coordonnées d’un POI avec la géométrie ISO alpha-3 du
pays associé à sa carte.

- Un point situé dans l’un des polygones du pays est accepté.
- Un point situé à moins de 1 km de la frontière est accepté pour absorber les
  imprécisions des tracés et des coordonnées.
- Un point plus éloigné déclenche un avertissement non bloquant. La création ou
  la modification nécessite alors une confirmation explicite.
- Dans l’aperçu KMZ, un point hors pays est signalé et désélectionné par défaut.
  Le sélectionner manuellement constitue la confirmation d’import.
- Si aucune frontière locale n’est disponible, l’enregistrement reste possible
  et l’aperçu d’import indique que la vérification n’a pas pu être effectuée.

Les territoires ultramarins présents dans un `MultiPolygon` du pays sont
acceptés. Les dépendances séparées et territoires disputés suivent le code ISO
attribué à leur géométrie dans le catalogue embarqué. La confirmation manuelle
reste disponible pour couvrir les exceptions et erreurs cartographiques.
