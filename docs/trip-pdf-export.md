# Export PDF des sorties

L’export PDF s’ouvre depuis le menu d’export du panneau Sortie. Un dialogue `Options d’export` permet de choisir le contenu avant de lancer la génération côté serveur.

Après génération, le frontend récupère le PDF authentifié sous forme de fichier puis déclenche explicitement son téléchargement. Le flux ne dépend pas de l’ouverture tardive d’un nouvel onglet et reste donc compatible avec les bloqueurs de popups. Le dialogue ne se ferme qu’une fois le fichier récupéré ; une erreur de téléchargement y reste affichée et peut être retentée.

## Options disponibles

- `Inclure la carte générale` ajoute la vue géographique globale du voyage. Cette option est activée par défaut.
- `Inclure les photos des lieux` ajoute la photo principale de chaque POI. Cette option est activée par défaut. Lorsqu’elle est désactivée, CartaVault ne charge ni ne traite les photos et la colonne correspondante disparaît.
- `Inclure les QR codes de navigation` ajoute un QR par étape. Cette option est activée par défaut. Lorsqu’elle est désactivée, aucun QR n’est produit et la largeur est rendue au descriptif.
- `Application de navigation` sélectionne `Google Maps` (par défaut), `Waze`, ou les deux. Au moins une application est requise lorsque les QR sont activés. Ce réglage n’apparaît que si les QR sont activés.

Les cartes d’étape utilisent des compositions dynamiques : descriptif + photo + un ou deux QR, descriptif + photo, descriptif + un ou deux QR, ou descriptif pleine largeur. Aucun emplacement vide n’est réservé à une option désactivée.

Chaque carte quotidienne représente les ancres réellement utilisées par le routage : `D` pour le départ de la journée et `A` pour son arrivée, en plus des POI numérotés dans l’ordre. Une nuit sert d’arrivée au jour précédent et de départ au jour suivant. Dans la chronologie, un séparateur vertical avec pictogramme automobile affiche la distance et la durée entre deux cartes d’étape. Si le segment n’est pas calculé ou n’est pas routable, ses valeurs sont indiquées comme indisponibles.

## Liens de navigation

Les URL sont construites exclusivement par le backend à partir de coordonnées validées. Le frontend ne transmet qu’une liste contrôlée de fournisseurs typés (`google_maps` et/ou `waze`).

```text
Google Maps: https://www.google.com/maps/search/?api=1&query={latitude},{longitude}
Waze:        https://waze.com/ul?ll={latitude},{longitude}&navigate=yes
```

Les coordonnées ont une représentation décimale stable, les paramètres sont encodés et les valeurs hors des plages latitude `[-90, 90]` et longitude `[-180, 180]` sont refusées.

## QR et pictogrammes

Les QR utilisent le niveau de correction d’erreur `H`, une zone calme de quatre modules et un pictogramme neutre local centré sur un fond blanc. Son empreinte est limitée à environ 16 % du code (fond de protection : 20 %). Une épingle identifie Google Maps et une bulle automobile identifie Waze. Aucun logo n’est téléchargé.

Sous chaque code figure le libellé compact `Google Maps` ou `Waze`. Une coordonnée absente ou invalide produit `Navigation indisponible` sans interrompre l’export. Une erreur isolée de génération QR est journalisée et reçoit le même état de repli.

## Photos et données manquantes

Quand les photos sont activées, l’image principale est utilisée si elle existe ; sinon un état neutre compact maintient l’alignement. Quand elles sont désactivées, la requête photo et la création de miniature sont entièrement évitées.

## Confidentialité et réseau

La génération ne contacte ni Google Maps ni Waze : CartaVault ne fait que construire leurs URL localement et ne transmet aucun identifiant interne ou jeton. Les pictogrammes sont dessinés localement. Si une carte est incluse et que le cache ne la contient pas, le backend peut en revanche télécharger les tuiles cartographiques OpenStreetMap configurées pour le fond de carte ; ce trafic est indépendant des liens de navigation.
