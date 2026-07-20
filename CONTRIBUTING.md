# Contribuer à CartaVault

Merci de l’intérêt porté à CartaVault.

CartaVault est une application open source de gestion cartographique de lieux, de cartes privées et de sorties. Les contributions peuvent concerner le frontend, le backend, la documentation, les tests, le déploiement ou l’expérience utilisateur.

Avant de commencer, consultez les issues existantes afin d’éviter les doublons et de vérifier si une discussion est déjà en cours.

## Sommaire

- [Code de conduite](#code-de-conduite)
- [Signaler un problème](#signaler-un-problème)
- [Proposer une fonctionnalité](#proposer-une-fonctionnalité)
- [Préparer l’environnement local](#préparer-lenvironnement-local)
- [Architecture du projet](#architecture-du-projet)
- [Créer une branche](#créer-une-branche)
- [Conventions de code](#conventions-de-code)
- [Lancer les vérifications](#lancer-les-vérifications)
- [Créer une migration Alembic](#créer-une-migration-alembic)
- [Sécurité et données sensibles](#sécurité-et-données-sensibles)
- [Commits](#commits)
- [Pull requests](#pull-requests)
- [Changements importants](#changements-importants)

## Code de conduite

Les échanges doivent rester respectueux, constructifs et centrés sur le projet.

Les critiques techniques sont les bienvenues lorsqu’elles sont argumentées et formulées sans attaque personnelle. Les comportements discriminatoires, agressifs ou délibérément perturbateurs ne sont pas acceptés.

## Signaler un problème

Utilisez le formulaire GitHub prévu pour les rapports de bug.

Avant de créer une issue :

1. vérifiez qu’une issue similaire n’existe pas déjà ;
2. testez si possible avec la version la plus récente ;
3. rassemblez les étapes nécessaires pour reproduire le problème ;
4. supprimez toute donnée sensible des journaux et captures.

Un bon rapport de bug doit inclure :

- la version ou le commit utilisé ;
- le système d’exploitation ;
- le navigateur si le problème concerne l’interface ;
- les étapes exactes de reproduction ;
- le résultat attendu ;
- le résultat observé ;
- les messages d’erreur utiles ;
- des captures d’écran lorsque cela apporte une information réelle.

Ne publiez jamais de mot de passe, jeton, clé API, fichier `.env`, cookie de session, adresse e-mail privée ou donnée personnelle dans une issue.

## Proposer une fonctionnalité

Utilisez le formulaire de demande de fonctionnalité.

Décrivez en priorité :

- le problème utilisateur à résoudre ;
- le comportement souhaité ;
- les alternatives déjà envisagées ;
- les critères d’acceptation ;
- les impacts possibles sur la sécurité, les permissions, la base de données ou l’interface.

Pour une évolution importante, ouvrez d’abord une issue de conception avant de commencer l’implémentation.

## Préparer l’environnement local

### Prérequis

L’environnement de développement courant repose sur :

- Git ;
- Docker Desktop ou Docker Engine avec Docker Compose ;
- Python 3.14 ;
- Node.js et npm ;
- PostgreSQL/PostGIS via Docker ;
- un éditeur tel que Visual Studio Code.

### Cloner le dépôt

```bash
git clone https://github.com/FlynX9/CartaVault.git
cd CartaVault
```

### Variables d’environnement

Créez les fichiers `.env` nécessaires à partir des exemples fournis dans le dépôt.

Exemple pour la configuration racine :

```bash
cp .env.example .env
```

Sous PowerShell :

```powershell
Copy-Item .env.example .env
```

Remplacez les valeurs d’exemple par des valeurs locales fortes et uniques.

Les fichiers `.env` réels ne doivent jamais être ajoutés à Git.

### Démarrer PostgreSQL/PostGIS

```bash
docker compose up -d postgres
```

Vérifiez l’état du service :

```bash
docker compose ps
```

### Backend

Depuis la racine du dépôt :

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
```

Sous Linux ou macOS :

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
pip install -r requirements.txt
```

Appliquez les migrations :

```bash
python -m alembic upgrade head
```

Démarrez l’API :

```bash
python -m uvicorn app.main:app --reload
```

L’API locale est généralement accessible sur :

```text
http://127.0.0.1:8000
```

La documentation Swagger est disponible sur :

```text
http://127.0.0.1:8000/docs
```

### Frontend

Dans un second terminal :

```bash
cd frontend
npm ci
npm run dev
```

Utilisez `npm ci` lorsque le fichier de verrouillage est présent afin de conserver une installation reproductible.

## Architecture du projet

CartaVault suit une architecture séparant les responsabilités principales.

### Backend

Le backend repose notamment sur :

- FastAPI ;
- SQLAlchemy ;
- GeoAlchemy2 ;
- PostgreSQL/PostGIS ;
- Alembic ;
- une organisation fonctionnelle des modules.

Les routes HTTP doivent rester légères. La logique métier complexe doit être placée dans des services ou modules dédiés plutôt que directement dans les routeurs.

Les accès aux données doivent respecter les permissions de l’utilisateur et le périmètre de la carte concernée.

### Frontend

Le frontend repose notamment sur :

- React ;
- TypeScript ;
- Vite ;
- Leaflet ;
- des composants réutilisables ;
- une interface compatible avec les modes clair et sombre.

Évitez de dupliquer des composants ou des styles déjà présents. Recherchez d’abord un composant générique pouvant être étendu.

### Base de données

La base PostgreSQL/PostGIS contient les données métier et géographiques.

Toute modification du schéma doit passer par une migration Alembic versionnée.

Ne modifiez pas manuellement une base partagée pour contourner une migration manquante.

## Créer une branche

Ne travaillez pas directement sur la branche principale.

Mettez d’abord votre branche locale à jour :

```bash
git checkout master
git pull --ff-only
```

Créez ensuite une branche courte et descriptive :

```bash
git checkout -b feat/export-kmz
```

Préfixes recommandés :

- `feat/` pour une fonctionnalité ;
- `fix/` pour une correction ;
- `docs/` pour la documentation ;
- `refactor/` pour une refactorisation ;
- `test/` pour les tests ;
- `chore/` pour la maintenance ;
- `security/` pour une correction de sécurité.

Exemples :

```text
feat/public-map-links
fix/trip-timeline-alignment
docs/contributing-guide
security/validate-uploaded-files
```

## Conventions de code

### Principes généraux

- privilégiez des changements ciblés ;
- évitez les refactorisations sans rapport avec l’issue ;
- conservez les noms explicites ;
- documentez les décisions non évidentes ;
- ajoutez ou adaptez les tests ;
- ne désactivez pas une règle de lint sans justification ;
- ne masquez pas une erreur avec un `try/except` ou un contournement silencieux.

### Python

- ajoutez des annotations de type lorsque cela améliore la lisibilité ;
- utilisez des modèles et schémas explicites ;
- gérez les erreurs métier avec des réponses contrôlées ;
- ne journalisez pas les secrets ;
- évitez les dépendances globales contenant des identifiants propres à un utilisateur ;
- utilisez des transactions cohérentes pour les opérations liées.

### React et TypeScript

- évitez `any` sauf justification précise ;
- conservez les composants focalisés sur une responsabilité ;
- factorisez les éléments répétés ;
- gérez explicitement les états de chargement, vide et erreur ;
- vérifiez le comportement clavier ;
- fournissez un nom accessible aux boutons ne contenant qu’une icône ;
- testez les modes clair et sombre ;
- contrôlez le responsive pour les changements visuels.

### CSS et interface

Respectez l’identité visuelle de CartaVault et les composants déjà validés.

Évitez :

- les valeurs arbitraires dupliquées ;
- les règles globales trop larges ;
- l’utilisation systématique de `!important` ;
- les contrastes insuffisants ;
- les zones cliquables trop petites ;
- les animations incompatibles avec `prefers-reduced-motion`.

## Lancer les vérifications

Les commandes exactes peuvent évoluer. Consultez également les scripts déclarés dans les fichiers du projet.

### Backend

Activez l’environnement virtuel, puis exécutez :

```bash
python -m compileall app
pytest
python -m alembic check
```

Pour tester les endpoints manuellement :

```bash
python -m uvicorn app.main:app --reload
```

Puis utilisez Swagger sur `/docs`.

Lorsqu’un test nécessite PostgreSQL/PostGIS, vérifiez que le service Docker de test est bien démarré et que la base ciblée n’est pas une base contenant des données personnelles.

### Frontend

```bash
npm ci
npm run lint
npm test
npm run build
```

Lorsque la modification concerne l’interface, effectuez également une vérification manuelle des points suivants :

- affichage en mode clair ;
- affichage en mode sombre ;
- navigation clavier ;
- absence de débordement ;
- largeur mobile ou tablette pertinente ;
- états de chargement, vide et erreur ;
- absence d’erreur dans la console du navigateur.

### Documentation

Pour une modification Markdown :

- vérifiez les liens ;
- vérifiez les chemins et noms de fichiers ;
- contrôlez le rendu sur GitHub ;
- utilisez un encodage UTF-8 ;
- évitez les commandes non testées ou spécifiques à un environnement non indiqué.

## Créer une migration Alembic

Une migration est nécessaire pour toute modification du schéma de base de données.

Après avoir modifié les modèles :

```bash
python -m alembic revision --autogenerate -m "description courte"
```

Relisez toujours le fichier généré. L’autogénération ne remplace pas une revue humaine.

Vérifiez notamment :

- les noms des tables et colonnes ;
- les contraintes `nullable` ;
- les clés étrangères ;
- les suppressions en cascade ;
- les index ;
- les types PostgreSQL/PostGIS ;
- les valeurs par défaut ;
- le contenu des fonctions `upgrade()` et `downgrade()`.

Appliquez ensuite la migration :

```bash
python -m alembic upgrade head
```

Contrôlez l’état Alembic :

```bash
python -m alembic current
python -m alembic check
```

Lorsque cela est pertinent, testez également le retour arrière sur une base de test :

```bash
python -m alembic downgrade -1
python -m alembic upgrade head
```

N’exécutez jamais un test destructif de migration sur une base contenant des données importantes sans sauvegarde.

Une pull request contenant une migration doit expliquer :

- pourquoi elle est nécessaire ;
- les données éventuellement transformées ;
- les risques de perte de données ;
- la compatibilité avec les versions précédentes ;
- la procédure de retour arrière ;
- les vérifications réellement effectuées.

## Sécurité et données sensibles

La sécurité fait partie des critères d’acceptation de chaque contribution.

### Ne jamais ajouter au dépôt

- fichiers `.env` réels ;
- mots de passe ;
- clés API Google ou autres fournisseurs ;
- jetons d’accès ;
- cookies de session ;
- clés privées ;
- certificats contenant une clé privée ;
- sauvegardes de base de données ;
- données personnelles ;
- photos ou exports privés ;
- clé `CARTAVAULT_CREDENTIALS_ENCRYPTION_KEY`.

### Identifiants et secrets

Les secrets doivent être fournis par variables d’environnement ou par le mécanisme de configuration prévu.

Lorsqu’un secret est stocké par CartaVault :

- il doit être chiffré selon l’architecture existante ;
- il doit être déchiffré uniquement au moment de l’usage ;
- il ne doit pas apparaître dans les journaux ;
- il ne doit pas être renvoyé en clair par l’API ;
- il doit être supprimé lors des opérations prévues de suppression ou d’anonymisation.

### Validation des entrées

Toute donnée utilisateur doit être considérée comme non fiable.

Portez une attention particulière à :

- l’upload de fichiers ;
- les noms de fichiers ;
- les URLs ;
- les imports KML/KMZ ;
- les champs HTML ou Markdown ;
- les coordonnées ;
- les identifiants d’objets ;
- les droits d’accès ;
- les limites de taille et de fréquence.

### Vulnérabilités

Ne créez pas d’issue publique contenant les détails exploitables d’une vulnérabilité.

Utilisez le mécanisme de signalement privé indiqué dans `SECURITY.md` et dans les paramètres GitHub du projet.

## Commits

Utilisez des messages courts, explicites et cohérents.

Format recommandé :

```text
type(scope): description
```

Exemples :

```text
feat(trips): add configurable visit duration
fix(auth): revoke sessions after password change
docs(readme): add project badges
test(import): cover duplicate KML places
security(upload): validate image content type
```

Types courants :

- `feat`
- `fix`
- `docs`
- `test`
- `refactor`
- `chore`
- `security`
- `build`
- `ci`

Un commit doit idéalement représenter une modification cohérente.

Évitez les messages tels que :

```text
update
fix
changes
work
```

## Pull requests

Avant d’ouvrir une pull request :

1. mettez votre branche à jour ;
2. relisez le diff complet ;
3. retirez les fichiers temporaires ;
4. vérifiez qu’aucun secret n’a été ajouté ;
5. lancez les tests pertinents ;
6. mettez à jour la documentation si nécessaire ;
7. vérifiez les migrations ;
8. associez la pull request à l’issue concernée.

Exemple :

```text
Closes #29
```

La description de la pull request doit préciser :

- le problème résolu ;
- les changements réalisés ;
- les choix techniques importants ;
- les tests exécutés ;
- les tests non exécutés et leur raison ;
- les migrations éventuelles ;
- les risques ou limites connus ;
- les captures d’écran pour les changements d’interface.

Ne déclarez pas qu’un test passe s’il n’a pas été exécuté.

Une pull request doit rester suffisamment ciblée pour être comprise et relue sans inclure plusieurs évolutions indépendantes.

## Changements importants

Ouvrez une issue de conception avant d’implémenter un changement qui touche notamment :

- l’authentification ;
- le modèle de permissions ;
- le chiffrement ;
- le stockage des photos ;
- le schéma de base de données ;
- le format des imports ou exports ;
- le routage ;
- l’architecture Docker ;
- les API publiques ;
- les fonctionnalités SaaS ;
- une dépendance structurante.

L’issue doit présenter :

- le besoin ;
- les solutions possibles ;
- les conséquences sur la compatibilité ;
- les impacts de sécurité ;
- les migrations nécessaires ;
- le plan de test ;
- la stratégie de retour arrière.

## Licence

En proposant une contribution à CartaVault, vous acceptez que votre contribution soit distribuée sous la licence MIT du projet.
