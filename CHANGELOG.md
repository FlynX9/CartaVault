# Changelog

Toutes les modifications notables de CartaVault seront documentées dans ce fichier.

Le format s’inspire de [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/) et le projet suit [Semantic Versioning](https://semver.org/lang/fr/) à partir des versions `0.x`.

## Convention de versionnement

Tant que CartaVault n’a pas atteint la version `1.0.0` :

- `0.MINOR.0` peut introduire de nouvelles fonctionnalités ou des changements incompatibles ;
- `0.MINOR.PATCH` contient principalement des corrections, ajustements et améliorations compatibles ;
- tout changement incompatible doit être signalé explicitement dans les notes de version ;
- les migrations de base de données doivent être documentées dans la section concernée.

## [Unreleased]

### Added

- Aucun changement documenté pour le moment.

### Changed

- Aucun changement documenté pour le moment.

### Deprecated

- Aucun changement documenté pour le moment.

### Removed

- Aucun changement documenté pour le moment.

### Fixed

- Aucun changement documenté pour le moment.

### Security

- Aucun changement documenté pour le moment.

## [0.1.0] - À publier

Première version publique de développement de CartaVault.

### Added

- Gestion de cartes privées associées à leurs utilisateurs.
- Gestion des lieux avec coordonnées géographiques PostGIS.
- Carte interactive Leaflet.
- Création d’un lieu depuis la carte.
- Catégories, tags et statuts.
- Catalogue local de 300 icônes de catégories.
- Photos associées aux lieux.
- Import KML/KMZ.
- Préparation de sorties et organisation par journées.
- Calcul d’itinéraires avec OSRM.
- Support optionnel de Google Routes avec identifiants propres à chaque utilisateur.
- Gestion des utilisateurs, rôles et permissions.
- Corbeille et historique.
- Interface claire et sombre.
- Documentation initiale du projet.
- Modèles GitHub pour les issues et pull requests.
- Guide de contribution.
- Checklist de tests manuels avant publication.

### Changed

- Le projet est présenté sous le nom CartaVault.
- L’interface a été progressivement harmonisée avec la nouvelle identité visuelle CartaVault.

### Security

- Chiffrement versionné des identifiants Google Routes.
- Aucune clé Google Routes stockée côté navigateur.
- Suppression des identifiants lors de l’anonymisation ou de la suppression du compte.
- Permissions appliquées sur les données appartenant aux cartes et utilisateurs.
- Exclusion des fichiers `.env`, clés privées et secrets du dépôt.

[Unreleased]: https://github.com/FlynX9/CartaVault/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/FlynX9/CartaVault/releases/tag/v0.1.0
