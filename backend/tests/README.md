# Tests du backend POI Manager

## Tests des statuts et migrations

Les tests unitaires couvrent la normalisation du slug et des couleurs. Les scénarios d’intégration couvrent le CRUD, le défaut unique, les conflits de suppression, l’affectation aux POI et le filtre cartographique. Ils nécessitent une `TEST_DATABASE_URL` dédiée.

Le cycle Alembic `upgrade → downgrade → upgrade` doit être exécuté uniquement sur `poi_manager_test` : le downgrade supprime `places.status_id` et perd donc les associations de statut. Ne jamais lancer ce cycle sur la base de développement.

## Scénarios pays et cartes

Les intégrations couvrent le catalogue, le CRUD et les conflits des cartes,
ainsi que la création et les filtres `map_id` des POI. Le cycle Alembic
`upgrade → downgrade → upgrade` doit viser uniquement une base dédiée telle que
`poi_manager_test`, jamais une base de développement contenant des données.
La migration refuse toute ancienne valeur `places.country` non reconnue et le
contrôle final vérifie qu'aucun POI ne conserve un `map_id` nul.

## Types de tests

- le marqueur `unit` couvre le contrôle de santé, le stockage photo et les
  validations de configuration sans ouvrir de connexion PostgreSQL ;
- le marqueur `integration` exerce les routes des places, tags et photos avec
  une base PostgreSQL/PostGIS séparée.

Sans `TEST_DATABASE_URL`, les tests d'intégration sont ignorés avec une raison
explicite. Ils n'utilisent jamais `DATABASE_URL` comme valeur de secours.

## Créer la base PostGIS de test

Le service `postgres` défini dans `docker-compose.yml` peut héberger une base
séparée sans supprimer ni modifier `poi_manager`. Depuis `backend` :

```powershell
docker compose -f ..\docker-compose.yml up -d postgres
docker compose -f ..\docker-compose.yml exec postgres psql -U poi_user -d postgres -c "CREATE DATABASE poi_manager_test;"
docker compose -f ..\docker-compose.yml exec postgres psql -U poi_user -d poi_manager_test -c "CREATE EXTENSION IF NOT EXISTS postgis;"
docker compose -f ..\docker-compose.yml exec postgres psql -U poi_user -d poi_manager_test -c "CREATE EXTENSION IF NOT EXISTS pgcrypto;"
```

La création de la base n'est nécessaire qu'une fois. Si elle existe déjà,
exécutez uniquement les commandes d'extensions, qui sont idempotentes.

Configurez ensuite uniquement la variable de test dans le terminal courant,
en remplaçant la valeur d'exemple du mot de passe par celle de votre
environnement :

```powershell
$env:TEST_DATABASE_URL="postgresql+psycopg://poi_user:change_me@localhost:5432/poi_manager_test"
```

La suite exige PostgreSQL, vérifie que PostGIS est activé et impose un nom de
base contenant `test`. Elle refuse aussi une URL qui cible le même hôte, port
et nom de base que `DATABASE_URL`.

## Préparation temporaire du schéma

La migration Alembic initiale est une baseline vide : `alembic upgrade head`
ne sait donc pas construire seul une base vide. Pour cette première suite,
la fixture de session :

1. valide strictement `TEST_DATABASE_URL` ;
2. vérifie que PostGIS est installé ;
3. charge tous les modèles via `app.main` ;
4. appelle `Base.metadata.create_all()` dans cette base de test uniquement.

La suite ne supprime jamais les tables et n'applique aucune migration. Cette
stratégie est temporaire jusqu'à ce que les migrations puissent reconstruire
tout le schéma depuis une base vide.

## Isolation et nettoyage

Chaque test d'intégration ouvre une connexion et une transaction externes. La
session SQLAlchemy utilise `join_transaction_mode="create_savepoint"`, ce qui
permet aux routes d'appeler `commit()` tout en conservant le rollback final de
la transaction externe.

Les uploads utilisent `tmp_path` via `PHOTO_STORAGE_PATH`. Aucun test n'écrit
dans `backend/storage/photos`, et la fixture échoue si un fichier temporaire
subsiste à la fin du test.

Pytest crée les fichiers de `tmp_path` sous `backend/.pytest_tmp`, qu'il
nettoie et recrée automatiquement à chaque exécution. Les tests ne dépendent
donc pas du dossier système `%TEMP%`. Les dossiers `.pytest_tmp` et
`.pytest_cache` sont des artefacts locaux et ne doivent pas être versionnés.

Si un arrêt brutal laisse un cache ou un dossier temporaire incohérent,
supprimez uniquement ces artefacts depuis `backend`, puis relancez pytest :

```powershell
Remove-Item -Recurse -Force .pytest_tmp,.pytest_cache -ErrorAction SilentlyContinue
```

## Commandes

Depuis `backend` :

```powershell
python -m pytest -m unit
python -m pytest -m integration
python -m pytest
```

Sans `TEST_DATABASE_URL`, les tests `unit` réussissent. Les tests marqués
`integration` sont ignorés avec la raison explicite définie dans
`tests/conftest.py`, y compris pendant une exécution complète. Avec une base
dédiée correctement configurée, la suite complète exécute les 26 tests.

> N'utilisez jamais l'URL de la base de développement comme
> `TEST_DATABASE_URL`. La suite ne supprime ni base, ni conteneur, ni volume.
