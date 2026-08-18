# Instance de démonstration CartaVault

Ce répertoire contient tout le nécessaire pour créer une instance locale, isolée et reproductible destinée aux captures d’écran et à la documentation. Les données sont fictives, les identifiants sont stables et aucune ressource personnelle ou secrète n’est utilisée.

## Démarrage

```powershell
Copy-Item .env.example .env
docker compose up --build -d postgis-demo cartavault-demo
docker compose run --rm demo-reset validate
```

L’application est ensuite disponible sur <http://localhost:8099>.

| Rôle | Adresse | Mot de passe |
|---|---|---|
| Propriétaire / administrateur | `demo.owner@cartavault.local` | `CartaVaultDemo!2026` |
| Éditeur | `demo.editor@cartavault.local` | `CartaVaultDemo!2026` |
| Lecture seule | `demo.viewer@cartavault.local` | `CartaVaultDemo!2026` |

Ces identifiants ne doivent jamais être réutilisés ailleurs. La stack n’est pas destinée à être exposée publiquement.

## Réinitialisation et validation

```powershell
docker compose run --rm demo-reset reset
docker compose run --rm demo-reset validate
```

Le reset refuse de s’exécuter sauf si les trois conditions suivantes sont réunies :

- `CARTAVAULT_DEMO_MODE=true` ;
- nom exact de la base : `cartavault_demo` ;
- hôte présent dans `CARTAVAULT_DEMO_DATABASE_HOSTS`.

Le jeu de données de référence contient trois utilisateurs, deux cartes (France et Italie), 60 POI, six régions et trois sorties couvrant les états planifié et brouillon. Les 30 POI français possèdent chacun une illustration originale légère dédiée aux captures. Une image supplémentaire, non rattachée et géolocalisée, documente le parcours de création d’un POI depuis les coordonnées GPS d’un média.

Les illustrations sources résident dans `assets/places/` et sont immuables pour le reset. La commande vérifie leur présence avant toute remise à zéro de la base, puis copie ces fichiers dans le volume photo d’exécution. Un `reset`, même répété, ne supprime donc jamais les images sources.

## Captures déterministes

```powershell
docker compose --profile screenshots run --rm screenshots
```

Les fichiers sont écrits dans `demo/output/`, ignoré par Git. Playwright impose une taille de fenêtre, une locale, un fuseau horaire et un mouvement réduit fixes. Les tuiles cartographiques distantes sont neutralisées afin que les captures ne dépendent ni du réseau ni d’un fournisseur tiers.

Pour modifier la couverture, éditer `screenshots.json`. Le manifeste sert de source unique aux scénarios locaux et CI.

La couverture de référence comprend la connexion, le tableau de bord, les lieux en thèmes clair et sombre, la lecture seule, la sortie française, sa chronologie, la médiathèque, le profil utilisateur et l’administration des utilisateurs. Les sept vues produit destinées au site et à la documentation sont capturées en français et en anglais ; le runner synchronise la préférence du compte avant chaque prise de vue.

## Arrêt et suppression

```powershell
docker compose down
docker compose down -v # supprime uniquement les volumes préfixés cartavault-demo
```

La stack utilise son propre réseau et ses propres volumes ; elle ne partage rien avec une instance CartaVault existante.

## Portainer sans registre d’images

1. Construire puis exporter l’image : `docker compose build demo-reset` puis `docker save --output runtime/cartavault-demo.tar cartavault:1.0.0-rc.5-demo`.
2. Dans **Images → Import**, importer le tar avec le tag `cartavault:1.0.0-rc.5-demo`.
3. Créer une stack `cartavault-demo` à partir de `compose.portainer.yml`.
4. Adapter `DEMO_PUBLIC_URL`, `DEMO_HTTP_PORT` et `DEMO_POSTGRES_PASSWORD` si nécessaire.

Le fichier Portainer exclut volontairement le service Playwright : les captures restent exécutées depuis le poste de développement ou la CI.
