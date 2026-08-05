# Brainstorming — Requêtes JQL multiples, onglets et champs personnalisables par requête

Date : 2026-08-05
Branche : `feature/multi-jql-queries` (la branche `main` reste la v1, taguée `v1`)

## Demande initiale

L'admin doit pouvoir configurer **plusieurs requêtes JQL**, chacune ayant :
- un **nom**
- un **onglet dédié** dans la navigation principale (à la place de l'unique lien "Issues" actuel)

Pour chaque requête, le comportement d'affichage reste le même qu'aujourd'hui (liste → clic → drawer de détail), **sauf que** pour chaque requête, l'admin doit aussi pouvoir personnaliser :
- les **onglets** du drawer de détail (actuellement figés : Infos, Contact, Activités, Besoin, Réalisation et prévision, Autres)
- les **champs Jira** affectés à chaque onglet
- la **visibilité de chaque onglet par rôle** (USER vs ADMIN) — aujourd'hui "Autres" et "Réalisation et prévision" sont figés en ADMIN-only dans le code

## État actuel (v1) — ce qui devient variable

| Élément | v1 (figé dans le code) | Cible (configurable par requête) |
|---|---|---|
| JQL | Une seule, stockée dans `AppConfig.jql` (`backend/src/services/config.ts:getJql`) | Plusieurs, chacune nommée |
| Navigation | Un seul lien "Issues" (`frontend/src/components/Layout.tsx`) | Un onglet par requête |
| Onglets du drawer | Tableau statique `ISSUE_FIELD_GROUPS` (`frontend/src/lib/issueFieldGroups.ts:14-59`), 5 groupes + "Autres" en catch-all | Définis par l'admin, par requête |
| Champs par onglet | Noms de champs Jira codés en dur par groupe | Liste de noms de champs éditable par l'admin, par onglet |
| Visibilité par rôle | `hiddenForUser = new Set(['autres', 'realisation'])` codé en dur (`frontend/src/components/IssueDetailDrawer.tsx:24-29`) | Toggle "visible pour USER" par onglet, par requête |
| Colonnes/filtres de la liste | Fixes : Statut, Profil Export, Offre Export (`backend/src/lib/jira.ts:LIST_EXTRA_FIELDS`, `frontend/src/pages/IssueList.tsx`) | À clarifier : figées ou configurables par requête aussi ? |

## Patterns réutilisables de la v1

- **AppConfig (clé/valeur, parfois JSON)** : déjà le mécanisme utilisé pour la personnalisation (nom d'app, logo, mention de confidentialité). Pour des entités multiples avec structure (plusieurs requêtes, chacune avec une config d'onglets), un vrai modèle Prisma dédié est plus adapté qu'empiler des clés `AppConfig`.
- **Le projet `referencement` (v1 de ce cycle, référence historique)** stockait des structures similaires (catégories, critères) en colonnes `Json` sur son modèle `Program` plutôt qu'en tables relationnelles séparées — un bon précédent pour stocker `tabsConfig`/`listColumns` en JSON sur un nouveau modèle `SavedQuery`, en évitant une explosion de tables relationnelles pour une structure qui n'a pas besoin d'être interrogée finement côté SQL.
- **`groupIssueFields()` (`frontend/src/lib/issueFieldGroups.ts:73-90`)** : la logique de matching nom-normalisé → champ est déjà pure et testée ; elle doit devenir paramétrable par une config venant du serveur au lieu d'une constante statique, mais l'algorithme reste identique.
- **`findFieldIdByName()` côté backend (`backend/src/lib/jira.ts`)** : même logique de normalisation déjà dupliquée côté backend pour résoudre les colonnes de liste (Profil/Offre Export) par nom Jira — à généraliser pour résoudre n'importe quel champ nommé par l'admin.
- **Pattern d'audit déjà en place** : toute création/modification de requête sauvegardée devrait logguer une action d'audit (`UPDATE_CONFIG`-like), cohérent avec le reste de l'admin.

## Risques et points d'attention identifiés

1. **Migration de la config actuelle** : au déploiement de cette fonctionnalité, la requête JQL globale existante et les 5 onglets actuels doivent-ils être automatiquement recréés comme une première "requête sauvegardée" (préservant le comportement actuel sans action admin), ou l'admin doit-il tout ressaisir manuellement ?
2. **Résolution des champs par requête** : aujourd'hui, la résolution nom→id de champ Jira (`findFieldIdByName`) suppose un catalogue global unique (`/rest/api/2/field`), ce qui reste vrai (le catalogue de champs ne dépend pas de la requête) — donc la complexité ajoutée est dans le *mapping* (quels champs vont dans quel onglet), pas dans la résolution technique elle-même.
3. **UI d'administration** : configurer des onglets + champs par onglet + visibilité par rôle, pour plusieurs requêtes, nécessite une interface d'admin non triviale (essentiellement un mini constructeur de formulaire). C'est la partie la plus coûteuse en développement de cette fonctionnalité.
4. **Saisie des noms de champs** : aujourd'hui les noms de champs métier sont écrits en dur par un développeur qui connaît le nom exact côté Jira. Une fois entre les mains de l'admin, une simple saisie de texte libre est source d'erreurs (faute de frappe = champ qui atterrit dans "Autres"). Un vrai sélecteur alimenté par `/rest/api/2/field` serait plus sûr mais ajoute du périmètre.
5. **Onglet "Autres" (catch-all)** : doit-il rester un onglet spécial implicite (toujours présent, non supprimable, mais avec son propre toggle de visibilité par rôle configurable comme les autres), pour continuer à garantir qu'aucun champ renseigné n'est jamais silencieusement invisible ?
6. **Route de détail d'issue** : aujourd'hui `GET /api/issues/:key` ne dépend d'aucun contexte de requête. Avec plusieurs requêtes ayant chacune sa propre config d'onglets, il faut savoir *depuis quelle requête* le detail a été ouvert pour appliquer le bon regroupement de champs — probablement `GET /api/queries/:queryId/issues/:key`.

## Conclusion du brainstorming

C'est un changement d'architecture significatif (nouveau modèle de données, nouvelles routes CRUD admin, navigation dynamique, UI d'admin pour construire la config d'onglets) plutôt qu'un ajout mineur — cohérent avec le besoin exprimé, mais qui mérite le même cycle complet (questions → spec → plan) que la v1 avant implémentation.

Passage à la phase de questions de cadrage → voir `05-multi-jql-specification.md`.
