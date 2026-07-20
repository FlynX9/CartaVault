# Checklist de tests manuels avant publication

Cette checklist complète les tests automatisés de CartaVault. Elle doit être exécutée avant chaque version, release candidate ou déploiement important.

Elle ne remplace pas les tests unitaires, les tests d’intégration, le lint, le build frontend ni les vérifications Alembic.

## Informations de validation

- Version ou commit testé :
- Date :
- Testeur :
- Environnement :
- Système d’exploitation :
- Navigateur :
- Mode de déploiement :
- Base de données utilisée :
- Fournisseur de routage testé :
- Résultat global : ☐ Conforme ☐ Conforme avec réserves ☐ Bloquant

## Préconditions

- [ ] La branche ou le commit à tester est clairement identifié.
- [ ] Les fichiers `.env` utilisés sont adaptés à l’environnement de test.
- [ ] Aucun secret réel n’est présent dans les journaux ou captures.
- [ ] PostgreSQL/PostGIS est démarré et accessible.
- [ ] Les migrations Alembic ont été appliquées.
- [ ] Le backend démarre sans erreur.
- [ ] Le frontend démarre sans erreur.
- [ ] La console du navigateur ne contient pas d’erreur bloquante au chargement.
- [ ] Un compte administrateur est disponible.
- [ ] Un compte utilisateur standard est disponible.
- [ ] Une base de test dédiée est utilisée.
- [ ] Une sauvegarde existe avant tout test destructif.

---

# 1. Authentification et sessions

## Connexion

- [ ] La page de connexion s’affiche correctement.
- [ ] Un utilisateur valide peut se connecter.
- [ ] Un mot de passe incorrect est refusé.
- [ ] Le message d’erreur ne révèle pas si l’adresse ou le compte existe.
- [ ] Les champs obligatoires sont signalés.
- [ ] Le bouton de connexion ne peut pas déclencher plusieurs soumissions simultanées.
- [ ] Une session valide persiste après actualisation de la page.
- [ ] Une session expirée renvoie vers l’écran de connexion.
- [ ] Les routes privées sont inaccessibles sans authentification.

## Déconnexion

- [ ] La déconnexion ferme correctement la session.
- [ ] Après déconnexion, le bouton Retour du navigateur ne redonne pas accès aux données privées.
- [ ] Les requêtes API après déconnexion sont refusées.
- [ ] Les données privées ne restent pas visibles dans l’interface.

## Compte utilisateur

- [ ] Le profil utilisateur s’affiche correctement.
- [ ] Les informations modifiables peuvent être mises à jour.
- [ ] Les validations de formulaire fonctionnent.
- [ ] Le changement de mot de passe exige le mot de passe actuel.
- [ ] Un mauvais mot de passe actuel est refusé.
- [ ] Le nouveau mot de passe respecte la politique définie.
- [ ] Les messages de succès et d’erreur sont compréhensibles.
- [ ] Aucune donnée sensible n’apparaît dans la console du navigateur.

---

# 2. Création et gestion d’une carte

## Liste des cartes

- [ ] La liste des cartes s’affiche.
- [ ] L’état vide est correct lorsqu’aucune carte n’existe.
- [ ] Les cartes accessibles à l’utilisateur sont visibles.
- [ ] Les cartes auxquelles l’utilisateur n’a pas accès ne sont pas visibles.
- [ ] Le chargement, l’état vide et les erreurs sont distincts.
- [ ] Le tri et les filtres éventuels fonctionnent.
- [ ] La sélection d’une carte actualise correctement le contenu.

## Création

- [ ] Une carte peut être créée avec les champs obligatoires.
- [ ] Le nom de la carte est validé.
- [ ] Le pays peut être sélectionné.
- [ ] La carte est immédiatement visible après création.
- [ ] L’utilisateur créateur devient propriétaire ou administrateur selon la règle prévue.
- [ ] Une erreur backend est affichée sans casser l’interface.
- [ ] Une double soumission ne crée pas deux cartes.

## Modification

- [ ] Le nom de la carte peut être modifié.
- [ ] Les paramètres disponibles peuvent être enregistrés.
- [ ] Les permissions sont respectées.
- [ ] Un utilisateur non autorisé ne peut pas modifier la carte via l’interface.
- [ ] Un utilisateur non autorisé ne peut pas modifier la carte via l’API.
- [ ] Les changements persistent après actualisation.

## Suppression

- [ ] La suppression demande une confirmation explicite.
- [ ] Une carte supprimée disparaît de la liste active.
- [ ] Les données liées suivent le comportement prévu.
- [ ] La suppression est refusée à un utilisateur non autorisé.
- [ ] Une suppression échouée ne laisse pas l’interface dans un état incohérent.

---

# 3. Ajout et modification d’un lieu

## Création depuis la carte

- [ ] Le clic droit ouvre l’action de création d’un lieu.
- [ ] Les coordonnées proposées correspondent à la position choisie.
- [ ] La carte reste utilisable après ouverture et fermeture du formulaire.
- [ ] La création peut être annulée sans donnée résiduelle.
- [ ] Un lieu valide peut être enregistré.
- [ ] Le nouveau marqueur apparaît immédiatement.
- [ ] Le nouveau lieu apparaît dans la liste.
- [ ] La carte se recentre correctement lorsque prévu.

## Création depuis un formulaire

- [ ] Les champs obligatoires sont identifiés.
- [ ] Le nom du lieu est validé.
- [ ] Les coordonnées invalides sont refusées.
- [ ] Les coordonnées hors plage sont refusées.
- [ ] Les décimales sont correctement interprétées.
- [ ] Les champs optionnels peuvent rester vides.
- [ ] Les textes longs sont correctement gérés.
- [ ] Les caractères accentués et internationaux sont conservés.
- [ ] Les balises HTML ou contenus dangereux ne sont pas exécutés.

## Modification

- [ ] Un lieu peut être ouvert depuis la liste.
- [ ] Un lieu peut être ouvert depuis son marqueur.
- [ ] Les modifications sont enregistrées.
- [ ] Les modifications sont visibles sans rechargement complet.
- [ ] Les coordonnées peuvent être modifiées.
- [ ] Le marqueur se déplace après modification des coordonnées.
- [ ] Les catégories, tags et statuts associés sont conservés.
- [ ] Les champs non modifiés ne sont pas perdus.
- [ ] Un utilisateur non autorisé ne peut pas modifier le lieu.

## Suppression et corbeille

- [ ] La suppression demande une confirmation.
- [ ] Le lieu n’apparaît plus dans la liste active.
- [ ] Le marqueur disparaît de la carte active.
- [ ] Le lieu apparaît dans la corbeille lorsque prévu.
- [ ] Les relations associées restent cohérentes.
- [ ] Les photos ne sont pas supprimées prématurément si une restauration est possible.

---

# 4. Catégories, tags et statuts

## Catégories

- [ ] La liste des catégories s’affiche.
- [ ] Une catégorie peut être créée.
- [ ] Le nom est validé.
- [ ] Une couleur peut être sélectionnée.
- [ ] Une icône locale peut être sélectionnée.
- [ ] La recherche d’icônes fonctionne.
- [ ] La recherche est insensible aux accents lorsque prévu.
- [ ] Le catalogue d’icônes reste utilisable au clavier.
- [ ] Une catégorie peut être modifiée.
- [ ] Une catégorie peut être supprimée selon les règles prévues.
- [ ] Les lieux associés restent cohérents après modification.
- [ ] Une icône invalide est refusée par le backend.

## Tags

- [ ] Un tag peut être créé.
- [ ] Un tag peut être modifié.
- [ ] Un tag peut être supprimé.
- [ ] Les doublons sont gérés selon la règle prévue.
- [ ] Les tags sont correctement associés aux lieux.
- [ ] Les filtres par tags fonctionnent.

## Statuts

- [ ] Un statut peut être créé.
- [ ] Un statut peut être modifié.
- [ ] Un statut peut être supprimé selon les règles prévues.
- [ ] La couleur du statut est visible.
- [ ] Le marqueur utilise la couleur attendue.
- [ ] Le filtre par statut fonctionne.
- [ ] Un lieu sans statut reste correctement affiché.

---

# 5. Photos

## Ajout

- [ ] Une photo valide peut être ajoutée à un lieu.
- [ ] Plusieurs photos peuvent être ajoutées lorsque prévu.
- [ ] Les formats autorisés sont acceptés.
- [ ] Les formats interdits sont refusés.
- [ ] Les fichiers trop volumineux sont refusés avec un message clair.
- [ ] Un fichier renommé avec une fausse extension est refusé si son contenu est invalide.
- [ ] Le nom original du fichier n’est pas utilisé de manière dangereuse.
- [ ] Le chargement affiche une progression ou un état explicite.
- [ ] Une erreur d’upload ne bloque pas les uploads suivants.

## Affichage

- [ ] Les miniatures s’affichent.
- [ ] L’image principale est correctement identifiée.
- [ ] L’ouverture d’une image fonctionne.
- [ ] Les proportions sont conservées.
- [ ] Une image manquante affiche un fallback propre.
- [ ] L’affichage fonctionne en mode sombre.
- [ ] Les images privées ne sont pas accessibles sans autorisation.

## Suppression

- [ ] Une photo peut être supprimée.
- [ ] Une confirmation est demandée lorsque prévu.
- [ ] La suppression retire la photo de l’interface.
- [ ] Le fichier associé est supprimé selon la politique prévue.
- [ ] La suppression de l’image principale sélectionne correctement une nouvelle image ou aucun fallback.

---

# 6. Import KML/KMZ

## Sélection du fichier

- [ ] Un fichier KML valide est accepté.
- [ ] Un fichier KMZ valide est accepté.
- [ ] Un fichier d’un autre type est refusé.
- [ ] Un fichier vide est refusé.
- [ ] Un fichier corrompu produit une erreur compréhensible.
- [ ] La taille maximale est appliquée.
- [ ] Le nom du fichier ne provoque aucun comportement inattendu.

## Prévisualisation

- [ ] Le nombre de lieux détectés est affiché.
- [ ] Les données reconnues sont présentées avant import lorsque prévu.
- [ ] Les éléments non reconnus sont signalés.
- [ ] Les coordonnées invalides sont signalées.
- [ ] Les doublons potentiels sont signalés.
- [ ] Les descriptions sont correctement décodées.
- [ ] Les caractères internationaux sont conservés.
- [ ] Les calques ou groupes sont interprétés selon la règle prévue.

## Import

- [ ] L’import crée les lieux attendus.
- [ ] Les catégories ou tags mappés sont corrects.
- [ ] Les descriptions sont conservées.
- [ ] Les coordonnées sont exactes.
- [ ] Les doublons suivent le choix utilisateur ou la règle prévue.
- [ ] Un import partiellement invalide ne laisse pas la base dans un état incohérent.
- [ ] Une annulation avant confirmation ne crée aucune donnée.
- [ ] Le rapport final indique les succès, ignorés et erreurs.

---

# 7. Filtres, recherche et actions groupées

## Recherche

- [ ] La recherche par nom fonctionne.
- [ ] La recherche ne tient pas compte de la casse lorsque prévu.
- [ ] Les accents sont gérés correctement lorsque prévu.
- [ ] Le résultat se met à jour sans erreur.
- [ ] L’absence de résultat affiche un état dédié.
- [ ] Effacer la recherche restaure la liste complète.

## Filtres

- [ ] Le filtre par catégorie fonctionne.
- [ ] Le filtre par tag fonctionne.
- [ ] Le filtre par statut fonctionne.
- [ ] Les filtres combinés donnent un résultat cohérent.
- [ ] Le compteur de résultats est correct.
- [ ] Les marqueurs visibles correspondent à la liste filtrée.
- [ ] Réinitialiser les filtres restaure tous les lieux.
- [ ] Les filtres restent cohérents après création ou modification d’un lieu.

## Tri

- [ ] Le tri par nom fonctionne.
- [ ] Le tri par date de création fonctionne.
- [ ] L’ordre ascendant et descendant est correct.
- [ ] Le tri reste stable lorsque plusieurs valeurs sont identiques.

## Actions groupées

- [ ] Plusieurs lieux peuvent être sélectionnés.
- [ ] La sélection reste visible.
- [ ] Une action groupée demande confirmation lorsque nécessaire.
- [ ] Une action partiellement interdite est gérée proprement.
- [ ] Les permissions sont vérifiées côté backend.
- [ ] La sélection est vidée au bon moment après l’action.

---

# 8. Corbeille et restauration

- [ ] La corbeille liste uniquement les éléments supprimés accessibles.
- [ ] La date de suppression est affichée lorsque prévue.
- [ ] Un lieu supprimé peut être restauré.
- [ ] Le lieu restauré réapparaît dans la bonne carte.
- [ ] Le marqueur restauré réapparaît.
- [ ] Les catégories, tags, statuts et photos sont restaurés selon les règles prévues.
- [ ] Une restauration impossible produit un message clair.
- [ ] La suppression définitive demande une confirmation renforcée.
- [ ] Un utilisateur sans droit ne peut pas restaurer ou supprimer définitivement.
- [ ] L’état vide de la corbeille est correct.

---

# 9. Partage, membres et permissions

## Invitations

- [ ] Un propriétaire ou administrateur peut inviter un utilisateur.
- [ ] Une adresse ou un utilisateur invalide est refusé.
- [ ] Une invitation en double est gérée proprement.
- [ ] L’invitation apparaît dans la liste.
- [ ] Le destinataire peut accepter l’invitation.
- [ ] Le destinataire peut refuser l’invitation.
- [ ] Une invitation révoquée ne peut plus être acceptée.
- [ ] Une invitation expirée est refusée lorsque cette fonctionnalité existe.

## Membres

- [ ] La liste des membres s’affiche.
- [ ] Le rôle de chaque membre est visible.
- [ ] Un rôle peut être modifié par un utilisateur autorisé.
- [ ] Un utilisateur non autorisé ne peut pas modifier les rôles.
- [ ] Un membre peut être retiré.
- [ ] Le propriétaire ne peut pas être retiré de manière incohérente.
- [ ] L’utilisateur courant ne peut pas contourner les règles de propriété.

## Contrôle d’accès

Tester au minimum avec un propriétaire, un éditeur et un lecteur.

- [ ] Le propriétaire dispose des droits attendus.
- [ ] L’éditeur peut effectuer uniquement les actions prévues.
- [ ] Le lecteur ne peut pas modifier les données.
- [ ] Les boutons interdits sont masqués ou désactivés.
- [ ] Les appels API interdits retournent un code approprié.
- [ ] Modifier un identifiant dans l’URL ne permet pas d’accéder à une autre carte.
- [ ] Les photos privées respectent les mêmes permissions.
- [ ] Les exports respectent les permissions.
- [ ] L’historique et la corbeille respectent les permissions.

---

# 10. Historique

- [ ] Les événements importants apparaissent dans l’historique.
- [ ] L’auteur de l’action est correctement identifié.
- [ ] La date et l’heure sont cohérentes.
- [ ] Les créations, modifications, suppressions et restaurations sont distinguées.
- [ ] Les changements de membres et permissions sont tracés lorsque prévu.
- [ ] Les données sensibles ne sont pas enregistrées dans l’historique.
- [ ] Un utilisateur ne voit que l’historique autorisé.
- [ ] L’état vide est correct.
- [ ] La pagination ou le chargement progressif fonctionne si présent.

---

# 11. Création et gestion d’une sortie

## Liste des sorties

- [ ] La liste s’affiche.
- [ ] L’état vide est correct.
- [ ] Une sortie peut être créée.
- [ ] Le nom et les dates sont validés.
- [ ] La sortie apparaît immédiatement après création.
- [ ] Une sortie peut être renommée.
- [ ] Une sortie peut être supprimée avec confirmation.

## Journées

- [ ] Une journée peut être ajoutée.
- [ ] Le numéro de journée est correct.
- [ ] L’ordre des journées est cohérent.
- [ ] La couleur propre à la journée est affichée.
- [ ] Le départ de journée peut être configuré.
- [ ] L’hébergement ou la nuit peut être configuré.
- [ ] Les badges et la chronologie sont correctement alignés.
- [ ] Le repli et dépli des journées fonctionne.
- [ ] Les paramètres d’une journée sont conservés après actualisation.

## Étapes

- [ ] Un POI existant peut être ajouté à une journée.
- [ ] Une étape libre peut être créée lorsque prévu.
- [ ] Une étape peut être déplacée dans la journée.
- [ ] Une étape peut être déplacée vers une autre journée.
- [ ] L’ordre des étapes est conservé.
- [ ] Une étape peut être supprimée sans supprimer le POI source.
- [ ] La durée de visite peut être modifiée.
- [ ] Les pauses et marges peuvent être modifiées.
- [ ] Les horaires estimés se recalculent correctement.
- [ ] Les changements n’écrasent pas silencieusement des données saisies.

---

# 12. Calcul et optimisation d’un itinéraire

## Calcul

- [ ] Un itinéraire peut être calculé avec OSRM.
- [ ] Le tracé apparaît sur la carte.
- [ ] La distance totale est affichée.
- [ ] Le temps de conduite brut est affiché.
- [ ] Le temps avec visites, pauses et marges est distingué.
- [ ] Le tracé correspond à l’ordre des étapes.
- [ ] Une étape sans coordonnées est signalée.
- [ ] Une erreur du fournisseur est présentée clairement.
- [ ] Une route obsolète est signalée après modification des étapes.

## Recalcul

- [ ] Modifier l’ordre des étapes marque la route comme obsolète.
- [ ] Ajouter une étape marque la route comme obsolète.
- [ ] Supprimer une étape marque la route comme obsolète.
- [ ] Modifier uniquement la durée de visite ne déclenche pas un recalcul routier inutile.
- [ ] Le recalcul remplace correctement l’ancienne géométrie.
- [ ] Les anciennes valeurs ne restent pas visibles après un échec.

## Optimisation

- [ ] L’optimisation respecte les points fixes prévus.
- [ ] L’ordre proposé est cohérent.
- [ ] L’utilisateur peut vérifier le résultat avant validation lorsque prévu.
- [ ] L’optimisation ne perd aucune étape.
- [ ] Les durées et distances sont recalculées.
- [ ] L’annulation conserve l’ordre précédent.

## Contraintes pays et fournisseur

- [ ] L’option « rester dans le pays » est transmise lorsque disponible.
- [ ] Le fallback vers OSRM fonctionne lorsque Google Routes n’est pas configuré.
- [ ] La clé Google Routes reste masquée dans l’interface.
- [ ] La suppression de la clé restaure le fallback attendu.
- [ ] Une erreur Google contrôlée n’expose aucun secret.
- [ ] Le rate limiting s’applique au bon utilisateur.

---

# 13. Exports

## Export de sortie

Tester uniquement les formats actuellement disponibles.

- [ ] L’export GPX se télécharge.
- [ ] L’export KMZ se télécharge.
- [ ] L’export destiné à Google Maps est généré lorsque disponible.
- [ ] Le nom du fichier est propre et prévisible.
- [ ] Les caractères spéciaux dans le nom de la sortie sont gérés.
- [ ] Les étapes sont dans le bon ordre.
- [ ] Les coordonnées sont exactes.
- [ ] Les journées sont distinguées lorsque le format le permet.
- [ ] Les données privées non nécessaires ne sont pas incluses.
- [ ] Un utilisateur sans permission ne peut pas exporter.

## Vérification externe

- [ ] Le GPX s’ouvre dans une application compatible.
- [ ] Le KMZ s’ouvre dans Google Earth ou un outil compatible.
- [ ] Les marqueurs sont correctement positionnés.
- [ ] Le tracé est visible lorsque le format le prévoit.
- [ ] Le fichier peut être réimporté sans erreur majeure lorsque cette compatibilité est attendue.

---

# 14. Compte utilisateur et identifiants Google Routes

- [ ] La page Compte s’affiche.
- [ ] L’état de la clé Google Routes est affiché sans révéler la clé.
- [ ] Une clé peut être ajoutée.
- [ ] Une clé existante peut être remplacée.
- [ ] La vérification de clé fonctionne.
- [ ] Une erreur de vérification est affichée de manière contrôlée.
- [ ] La suppression exige le mot de passe utilisateur.
- [ ] Un mauvais mot de passe empêche la suppression.
- [ ] Après suppression, OSRM redevient le fournisseur utilisé.
- [ ] La clé n’apparaît pas dans le stockage local du navigateur.
- [ ] La clé n’apparaît pas dans les logs frontend.
- [ ] La clé n’apparaît pas dans les réponses API.
- [ ] Les métadonnées `verified_at`, `last_used_at` et `last_error_code` évoluent correctement lorsqu’elles sont exposées.
- [ ] Un utilisateur ne peut pas accéder à la clé d’un autre utilisateur.
- [ ] La suppression ou anonymisation du compte supprime les identifiants associés.

---

# 15. Modes clair, sombre et fonds cartographiques

## Thème

- [ ] Le mode clair s’affiche correctement.
- [ ] Le mode sombre s’affiche correctement.
- [ ] Le changement de thème ne provoque pas de flash majeur.
- [ ] Les panneaux, modales, menus et formulaires suivent le thème.
- [ ] Les contrastes restent lisibles.
- [ ] Les icônes restent visibles.
- [ ] Les graphiques, tracés et marqueurs restent compréhensibles.
- [ ] Les états de focus sont visibles dans les deux thèmes.

## Fonds de carte

- [ ] Le fond clair se charge.
- [ ] Le fond sombre se charge.
- [ ] Le fond satellite se charge lorsque configuré.
- [ ] Le fallback OSM fonctionne.
- [ ] L’attribution cartographique reste visible.
- [ ] Le changement de fond ne supprime pas les marqueurs.
- [ ] Le changement de fond ne supprime pas les tracés.
- [ ] Les erreurs de tuiles n’empêchent pas l’usage général de l’application.

---

# 16. Responsive

Tester au minimum aux largeurs suivantes :

- 360 px ;
- 520 px ;
- 768 px ;
- 1024 px ;
- écran de bureau courant.

## Navigation et panneaux

- [ ] La navigation principale reste accessible.
- [ ] Aucun défilement horizontal global inattendu n’apparaît.
- [ ] Les panneaux Lieux et Sorties restent utilisables.
- [ ] Les panneaux peuvent être ouverts et fermés.
- [ ] La carte reste accessible.
- [ ] Les en-têtes ne débordent pas.
- [ ] Les actions ne se chevauchent pas.
- [ ] Les boutons tactiles ont une taille suffisante.

## Formulaires et modales

- [ ] Les formulaires sont utilisables sur petit écran.
- [ ] Les libellés restent lisibles.
- [ ] Les listes déroulantes restent accessibles.
- [ ] Les modales ne dépassent pas de manière bloquante.
- [ ] Le bouton de fermeture reste visible.
- [ ] Le clavier virtuel ne masque pas les actions principales lorsque cela peut être testé.

## Sorties

- [ ] Les journées restent lisibles.
- [ ] Les badges de chronologie restent alignés.
- [ ] Les étapes ne se chevauchent pas.
- [ ] Les actions de journée restent accessibles.
- [ ] Les durées et horaires ne débordent pas.

---

# 17. Accessibilité clavier

- [ ] Toutes les actions principales sont accessibles au clavier.
- [ ] L’ordre de tabulation est logique.
- [ ] Le focus visible est présent.
- [ ] Les boutons icônes ont un nom accessible.
- [ ] Les modales piègent correctement le focus lorsque nécessaire.
- [ ] Le focus revient sur l’élément déclencheur après fermeture.
- [ ] La touche Échap ferme les éléments prévus.
- [ ] Entrée et Espace activent les boutons appropriés.
- [ ] Les menus peuvent être parcourus au clavier.
- [ ] Les sélecteurs et listes sont utilisables sans souris.
- [ ] Les messages d’erreur sont associés aux champs concernés.
- [ ] `prefers-reduced-motion` est respecté pour les animations concernées.

---

# 18. États de chargement, vides et erreurs

- [ ] Les listes affichent un état de chargement identifiable.
- [ ] Les squelettes ne provoquent pas de déplacement majeur de mise en page.
- [ ] Les états vides sont distincts des erreurs.
- [ ] Les états vides proposent une action pertinente lorsque possible.
- [ ] Une erreur réseau affiche un message compréhensible.
- [ ] Une erreur API n’affiche pas de trace technique brute à l’utilisateur.
- [ ] Une action peut être retentée lorsque pertinent.
- [ ] L’interface reste utilisable après une erreur.
- [ ] Les boutons sont réactivés après un échec.
- [ ] Une requête lente ne déclenche pas plusieurs actions identiques.

---

# 19. Sécurité de base

- [ ] Aucun fichier `.env` réel n’est suivi par Git.
- [ ] Aucun mot de passe ou jeton n’apparaît dans le dépôt.
- [ ] Aucun secret n’apparaît dans les réponses API.
- [ ] Aucun secret n’apparaît dans la console du navigateur.
- [ ] Aucun secret n’apparaît dans les logs backend.
- [ ] Les cookies de session utilisent les attributs prévus.
- [ ] Les routes privées refusent les utilisateurs non authentifiés.
- [ ] Les permissions sont vérifiées côté backend.
- [ ] Les identifiants UUID modifiés manuellement ne donnent pas accès aux données d’un autre utilisateur.
- [ ] Les uploads refusent les types inattendus.
- [ ] Les imports refusent les archives ou contenus invalides.
- [ ] Les champs texte n’exécutent pas de HTML ou JavaScript injecté.
- [ ] Les erreurs ne révèlent pas la chaîne de connexion ni les chemins internes sensibles.
- [ ] Les suppressions sensibles demandent une confirmation adaptée.
- [ ] Les limites de fréquence importantes fonctionnent lorsqu’elles sont prévues.

---

# 20. Vérifications finales

## Frontend

- [ ] `npm ci` réussit.
- [ ] `npm run lint` réussit.
- [ ] Les tests frontend réussissent.
- [ ] `npm run build` réussit.
- [ ] Aucun avertissement nouveau important n’est ignoré.
- [ ] Aucun fichier généré inutile n’est ajouté au dépôt.

## Backend

- [ ] `python -m compileall app` réussit.
- [ ] Les tests backend réussissent.
- [ ] `python -m alembic check` réussit.
- [ ] `python -m alembic current` pointe vers la révision attendue.
- [ ] L’application démarre sur une base neuve.
- [ ] L’application démarre après migration d’une base existante de test.
- [ ] Aucun avertissement critique n’est ignoré.

## Git et documentation

- [ ] Le diff final a été relu.
- [ ] Les fichiers temporaires sont absents.
- [ ] Les fichiers sensibles sont absents.
- [ ] Le README reste exact.
- [ ] Le `CONTRIBUTING.md` reste exact.
- [ ] Les migrations et variables d’environnement nouvelles sont documentées.
- [ ] Les captures du README existent toujours aux chemins indiqués.
- [ ] Les liens Markdown importants fonctionnent.
- [ ] Le changelog est mis à jour lorsque nécessaire.

## Publication

- [ ] Les problèmes bloquants sont résolus.
- [ ] Les problèmes non bloquants sont documentés.
- [ ] Le numéro de version est cohérent.
- [ ] Les notes de version sont prêtes.
- [ ] La procédure de sauvegarde est connue.
- [ ] La procédure de retour arrière est connue.
- [ ] Le tag n’est créé qu’après validation finale.
- [ ] Aucun badge de CI n’est ajouté tant que la CI publique n’est pas fiable.

---

# Résultat de la campagne

## Anomalies bloquantes

- 

## Anomalies non bloquantes

- 

## Tests non exécutés

- 

## Réserves

- 

## Décision

- [ ] Publication autorisée
- [ ] Publication autorisée avec réserves
- [ ] Publication refusée

## Validation

- Nom :
- Date :
- Version ou commit :
