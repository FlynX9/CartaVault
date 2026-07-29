# Architecture des tâches asynchrones

## Décision actuelle

CartaVault reste volontairement sans Redis ni worker dans les petites
installations. Redis ne doit jamais contenir la vérité métier : PostgreSQL et
le stockage de fichiers restent les sources d'autorité. Cette décision évite un
service obligatoire tant qu'aucun export, import, email ou traitement image ne
dépasse régulièrement la durée acceptable d'une requête HTTP.

Le suivi KMZ et les métadonnées des exports temporaires sont actuellement liés
au processus. Ce comportement est acceptable uniquement sur une instance
unique ; il est le déclencheur concret de l'adoption décrite ci-dessous avant
tout déploiement avec plusieurs processus backend.

## Comparaison des options

| Option | Intégration FastAPI | Atouts | Limites | Décision |
| --- | --- | --- | --- | --- |
| Celery + Redis | Mature mais synchrone | Planification, écosystème, supervision | Configuration et surface d'exploitation élevées | Non retenu par défaut |
| RQ | Très simple | Bon pour les petits traitements | Moins de primitives async et de planification | Alternative acceptable |
| Dramatiq + Redis | Python simple, retries explicites | Middleware, erreurs et observabilité propres | Service Redis requis | Retenu si le besoin devient concret |
| Arq + Redis | Asyncio natif | Adapté à FastAPI et I/O réseau | Écosystème plus réduit | À réévaluer pour les flux surtout I/O |

Le choix recommandé est Dramatiq avec Redis privé : tâches explicites,
retries bornés et commandes worker séparées. Aucune de ces dépendances ne doit
être activée avant la migration persistante ci-dessous.

## Contrat persistant

Une future table `background_tasks` doit contenir : `id`, `type`, `user_id`,
`map_id` ou ressource associée, `status`, `progress`, `created_at`,
`started_at`, `finished_at`, `expires_at`, `error_code`, `result_reference` et
un compteur de tentatives. Les états autorisés sont `pending`, `running`,
`succeeded`, `failed`, `cancelled` et `expired`.

La file ne reçoit que l'identifiant de tâche. Le worker recharge les ressources
dans PostgreSQL, revalide l'utilisateur, le rôle et les limites avant toute
action sensible. Il ne reçoit ni secret, cookie, clé API, binaire ou résultat
volumineux. Une révocation d'accès avant l'exécution annule la tâche avec une
erreur de domaine contrôlée.

Les tâches doivent être idempotentes, utiliser une clé de déduplication par
ressource/opération, avoir un timeout propre, au plus trois tentatives avec
backoff et aucune relance infinie. Au démarrage, les tâches `running` sans
heartbeat récent sont marquées `failed` avec `worker_restarted` ou remises en
file si elles sont explicitement idempotentes. Un nettoyage quotidien expire
les états et efface les artefacts temporaires associés.

## Migration progressive

1. Créer la table et les endpoints de lecture/cancellation avec exécution
   synchrone configurable.
2. Migrer les prévisualisations et confirmations KMZ : le contenu temporaire
   devient un artefact privé référencé en base, avec limites explicites des
   images distantes et déduplication par URL.
3. Migrer les exports GPX/KMZ : l'artefact et son autorisation de téléchargement
   sont persistants jusqu'à leur TTL.
4. Activer Dramatiq/Redis seulement avec `TASKS_MODE=worker`; conserver
   `TASKS_MODE=inline` pour une instance simple.
5. Ajouter ensuite email, miniatures et IA, un cas d'usage à la fois.

L'interface doit interroger les endpoints par ID, restaurer l'état après
rafraîchissement, annoncer progression/succès/échec, permettre l'annulation
lorsqu'elle est supportée et exposer les téléchargements seulement au
demandeur encore autorisé.

## Déploiement et observabilité

Le futur Compose doit placer `redis` et `worker` sur le réseau privé, sans port
publié pour Redis, avec authentification, healthcheck, limite mémoire et
`restart: unless-stopped`. Redis ne nécessite pas de sauvegarde lorsque la
table PostgreSQL est le registre des tâches ; sa persistance ne sert alors qu'à
la reprise de messages non terminés.

Les logs structurés portent `task_id`, type et code d'erreur, jamais le payload.
Les métriques minimales sont : longueur de file, workers actifs, durée,
tentatives, échecs, tâches bloquées et expirations. Les tests requis avant
l'activation couvrent accès multi-processus, reprise après redémarrage,
soumissions concurrentes, RBAC, TTL et téléchargement autorisé.
