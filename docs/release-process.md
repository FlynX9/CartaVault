# Processus de versionnement et de publication

Ce document décrit la stratégie de versionnement et la procédure recommandée pour publier une version de CartaVault.

## Stratégie de versionnement

CartaVault utilise Semantic Versioning sous la forme :

```text
MAJOR.MINOR.PATCH
```

Avant la version `1.0.0`, la convention retenue est la suivante :

- `0.MINOR.0` : nouvelle fonctionnalité importante, évolution d’architecture ou changement potentiellement incompatible ;
- `0.MINOR.PATCH` : correction de bug, amélioration compatible, documentation ou maintenance ;
- `1.0.0` : première version considérée comme stable.

Exemples :

```text
0.1.0  Première version publique de développement
0.1.1  Correctifs sans changement majeur de comportement
0.2.0  Nouvelle fonctionnalité importante ou évolution incompatible
1.0.0  Première version stable
```

## Changements incompatibles

Tout changement incompatible doit être signalé dans :

- `CHANGELOG.md` ;
- les notes de version GitHub ;
- la pull request correspondante ;
- la documentation de migration si nécessaire.

Exemples de changements incompatibles :

- modification d’un format d’import ou d’export ;
- suppression ou renommage d’une variable d’environnement ;
- changement de comportement d’une API ;
- modification du modèle de permissions ;
- migration de base de données non réversible ;
- changement du format de stockage des photos ;
- modification de la clé ou du mécanisme de chiffrement.

## Préparer une version

### 1. Choisir la version

Déterminer le prochain numéro en fonction de la nature des changements.

Exemple :

```text
0.1.0 → 0.1.1 pour des correctifs
0.1.1 → 0.2.0 pour une évolution importante
```

### 2. Mettre à jour la branche principale

```bash
git checkout master
git pull --ff-only
```

### 3. Créer une branche de release

```bash
git checkout -b release/0.1.0
```

### 4. Mettre à jour le changelog

Dans `CHANGELOG.md` :

1. déplacer les éléments utiles de `[Unreleased]` vers une nouvelle section ;
2. ajouter la date au format `AAAA-MM-JJ` ;
3. remettre les rubriques `[Unreleased]` à zéro ;
4. vérifier les liens de comparaison en bas du fichier.

Exemple :

```markdown
## [0.1.0] - 2026-07-20
```

### 5. Vérifier les migrations

Depuis `backend` :

```bash
python -m alembic current
python -m alembic check
```

Sur une base de test propre :

```bash
python -m alembic upgrade head
```

Lorsqu’un retour arrière est pris en charge :

```bash
python -m alembic downgrade -1
python -m alembic upgrade head
```

Ne jamais tester un downgrade destructif sur une base contenant des données importantes.

### 6. Exécuter les vérifications backend

```bash
python -m compileall app
pytest
python -m alembic check
```

Documenter clairement tout test non exécuté.

### 7. Exécuter les vérifications frontend

Depuis `frontend` :

```bash
npm ci
npm run lint
npm test
npm run build
```

### 8. Exécuter la checklist manuelle

Utiliser :

```text
docs/manual-test-checklist.md
```

Le résultat doit être au minimum :

```text
Publication autorisée
```

ou :

```text
Publication autorisée avec réserves
```

Les réserves doivent alors être documentées dans les notes de version.

### 9. Vérifier la documentation

Contrôler notamment :

- `README.md` ;
- `CONTRIBUTING.md` ;
- `SECURITY.md` ;
- `CHANGELOG.md` ;
- les variables d’environnement d’exemple ;
- les instructions Docker ;
- les procédures de migration ;
- les captures d’écran ;
- les liens Markdown.

### 10. Vérifier les secrets

Avant publication :

```bash
git status
git diff --cached
```

Vérifier l’absence de :

- fichiers `.env` réels ;
- clés privées ;
- jetons ;
- mots de passe ;
- sauvegardes ;
- photos ou exports privés ;
- données personnelles ;
- clé `CARTAVAULT_CREDENTIALS_ENCRYPTION_KEY`.

## Créer le commit de release

```bash
git add CHANGELOG.md docs/release-process.md
git commit -m "chore(release): prepare v0.1.0"
```

Pousser la branche :

```bash
git push -u origin release/0.1.0
```

Ouvrir ensuite une pull request vers `master`.

## Créer le tag

Après fusion de la pull request :

```bash
git checkout master
git pull --ff-only
git tag -a v0.1.0 -m "CartaVault v0.1.0"
git push origin v0.1.0
```

Le tag doit toujours pointer vers un commit déjà présent sur la branche principale.

## Créer la release GitHub

Avec GitHub CLI :

```bash
gh release create v0.1.0 \
  --repo FlynX9/CartaVault \
  --title "CartaVault v0.1.0" \
  --notes-file RELEASE_NOTES.md
```

Les notes de version doivent inclure :

- résumé de la version ;
- nouvelles fonctionnalités ;
- corrections ;
- changements incompatibles ;
- migrations nécessaires ;
- nouvelles variables d’environnement ;
- limites connues ;
- procédure de mise à jour ;
- procédure de retour arrière.

Ne pas déclarer qu’un test passe s’il n’a pas réellement été exécuté.

## Procédure de mise à jour

Avant toute mise à jour :

1. sauvegarder PostgreSQL/PostGIS ;
2. sauvegarder les photos et autres fichiers persistants ;
3. sauvegarder les variables d’environnement ;
4. sauvegarder la clé `CARTAVAULT_CREDENTIALS_ENCRYPTION_KEY` ;
5. noter la version actuellement déployée.

Exemple général :

```bash
git fetch --tags
git checkout v0.1.0
docker compose pull
docker compose build
docker compose up -d
```

Appliquer ensuite les migrations selon la procédure du déploiement.

## Retour arrière

Le retour arrière dépend de la nature du changement.

### Application uniquement

Lorsqu’aucune migration incompatible n’a été appliquée :

```bash
git checkout <ancien-tag>
docker compose build
docker compose up -d
```

### Base de données

Lorsqu’une migration a été appliquée :

- utiliser `alembic downgrade` uniquement si la migration a été conçue et testée pour cela ;
- restaurer la sauvegarde si le downgrade est risqué ou destructif ;
- ne jamais improviser un retour arrière sur une base de production.

### Secrets et chiffrement

La perte de `CARTAVAULT_CREDENTIALS_ENCRYPTION_KEY` rend les identifiants chiffrés illisibles.

Cette clé doit être restaurée avec la même valeur lors d’un retour arrière ou d’une migration vers un autre serveur.

## Version corrective

Pour publier un correctif :

```text
v0.1.0 → v0.1.1
```

Procédure recommandée :

```bash
git checkout master
git pull --ff-only
git checkout -b fix/critical-problem
```

Après validation et fusion :

```bash
git tag -a v0.1.1 -m "CartaVault v0.1.1"
git push origin v0.1.1
```

## Annuler une release GitHub

Une release GitHub peut être supprimée si elle a été publiée par erreur, mais un tag public ne doit pas être déplacé silencieusement.

Lorsqu’une version publiée contient un défaut :

- conserver l’historique ;
- publier une nouvelle version corrective ;
- marquer éventuellement la version défectueuse comme non recommandée ;
- expliquer clairement le problème dans les notes de version.

## Checklist condensée

- [ ] Version choisie
- [ ] Branche de release créée
- [ ] Changelog mis à jour
- [ ] Migrations vérifiées
- [ ] Tests backend exécutés
- [ ] Tests frontend exécutés
- [ ] Checklist manuelle exécutée
- [ ] Documentation vérifiée
- [ ] Secrets vérifiés
- [ ] Pull request fusionnée
- [ ] Tag annoté créé
- [ ] Release GitHub créée
- [ ] Procédure de mise à jour documentée
- [ ] Procédure de retour arrière documentée
