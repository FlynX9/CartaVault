# Instance Status

La section **Administration → État de l’instance** fournit un diagnostic opérationnel synthétique de CartaVault. Elle est réservée aux administrateurs globaux côté interface et côté API. Elle ne remplace ni Prometheus/Grafana, ni une journalisation centralisée, ni une stratégie de sauvegarde et de restauration, ni un audit de sécurité formel.

## API, cache et unités

- `GET /admin/console/instance` retourne la dernière mesure disponible.
- `POST /admin/console/instance/refresh` force une nouvelle mesure.
- Le cache est local au processus et dure 30 secondes. Les rafraîchissements concurrents sont sérialisés.
- Les dates sont en UTC ISO 8601, les tailles en octets, les latences en millisecondes, les durées en secondes et les pourcentages sous forme numérique.

## États et agrégation

- `operational` : contrôle concluant sans alerte significative.
- `degraded` : service utilisable, mais une action non critique est recommandée.
- `unavailable` : composant obligatoire indisponible.
- `misconfigured` : configuration requise ou sûre absente, notamment en production.
- `unknown` : aucune source de vérité fiable.

L’état global est `unavailable` si l’application, PostgreSQL/PostGIS ou le stockage est indisponible. Il est `misconfigured` si un composant obligatoire ou un contrôle de sécurité important l’est. Une anomalie optionnelle produit `degraded`. Une valeur inconnue n’est jamais assimilée à un succès.

## Mesures et limites connues

Les contrôles couvrent l’application, PostgreSQL/PostGIS, Alembic, le stockage local, les volumes fonctionnels, les sessions, HTTPS, Resend, la cartographie, OSRM, la maintenance, les sauvegardes et la configuration de sécurité.

- Le stockage est sondé avec un fichier temporaire immédiatement supprimé ; aucun chemin hôte complet n’est exposé. Seuils : 70 % avertissement, 85 % élevé, 95 % critique.
- OSRM utilise une requête légère bornée à deux secondes. Aucun appel Google Routes facturable et aucun déchiffrement de clé utilisateur n’est effectué.
- Resend est évalué uniquement à partir des métadonnées locales. Aucun email et aucun appel fournisseur ne sont déclenchés.
- Si TLS termine sur un proxy externe, certificat, HSTS et redirection restent `unknown` faute de preuve côté application.
- L’application ne possède pas encore d’historique structuré des livraisons email ou erreurs. Les erreurs affichées sont les échecs des contrôles actuels, sans stack trace ni charge utile.
- Aucun sous-système de sauvegarde, Redis ou worker n’est déclaré. Leur état reste `unknown`; aucune preuve de sauvegarde n’est fabriquée.
- Les totaux actifs excluent les utilisateurs et lieux supprimés. Les lieux supprimés sont comptés séparément.

## Confidentialité et extension

La réponse ne contient ni nom ou email utilisateur, ni contenu de POI, ni jeton, ni chaîne de connexion, ni clé API ou clé de chiffrement. Les erreurs utilisent des codes stables. Un non-administrateur reçoit un refus `403`.

Pour ajouter un contrôle, créer un schéma explicite, une fonction isolée, un code d’erreur stable et un rendu accessible. Toute dépendance externe doit avoir un délai maximal, ne pas être facturable lors d’une lecture passive et ne pas faire échouer les autres composants. Couvrir agrégation, isolation, redaction et rendu par des tests.

Les tests avec base de données doivent cibler exclusivement `cartavault_test`.
