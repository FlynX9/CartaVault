# Tests du backend POI Manager

## Types de tests

- `unit` couvre le stockage photo et les validations qui ne doivent jamais
  ouvrir de connexion PostgreSQL.
- `integration` exerce l'API avec une base PostgreSQL/PostGIS séparée.

Sans `TEST_DATABASE_URL`, les tests d'intégration sont ignorés avec une raison
explicite. Ils n'utilisent jamais `DATABASE_URL` comme valeur de secours.

## Créer la base PostGIS de test

Le conteneur défini par `docker-compose.yml` peut héberger une base séparée,
sans supprimer ni modifier `poi_manager` :

```powershell
docker exec poi-postgres psql -U poi_user -d postgres -c "CREATE DATABASE poi_manager_test;"
docker exec poi-postgres psql -U poi_user -d poi_manager_test -c "CREATE EXTENSION IF NOT EXISTS postgis;"
docker exec poi-postgres psql -U poi_user -d poi_manager_test -c "CREATE EXTENSION IF NOT EXISTS pgcrypto;"
```

Configurez ensuite uniquement la variable de test dans le terminal courant :

```powershell
$env:TEST_DATABASE_URL="postgresql+psycopg://poi_user:poi_password@localhost:5432/poi_manager_test"
```

Le nom de la base de test doit contenir `test`. La suite refuse aussi une URL
qui cible le même hôte, port et nom de base que `DATABASE_URL`.

## Préparation temporaire du schéma

La migration Alembic initiale est une baseline vide : `alembic upgrade head`
ne sait donc pas construire seul une base vide. Pour cette première suite,
la fixture de session :

1. valide strictement `TEST_DATABASE_URL` ;
2. vérifie que PostGIS est installé ;
3. charge tous les modèles via `app.main` ;
4. appelle `Base.metadata.create_all()` dans cette base de test uniquement.

La suite ne supprime jamais les tables. Cette stratégie est temporaire jusqu'à
ce que les migrations puissent reconstruire tout le schéma depuis une base
vide.

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

Sans `TEST_DATABASE_URL`, la première commande réussit et les deux autres
signalent clairement les tests d'intégration ignorés.

> N'utilisez jamais l'URL de la base de développement comme
> `TEST_DATABASE_URL`. La suite ne supprime ni base, ni conteneur, ni volume.
