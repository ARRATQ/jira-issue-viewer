# Plan d'implémentation — Requêtes JQL multiples personnalisables

Date : 2026-08-05
Statut : en attente de confirmation avant démarrage
Branche : `feature/multi-jql-queries`
Référence : `05-multi-jql-specification.md` (spec validée)

## Patterns à reprendre (depuis la v1 de ce projet)

| Catégorie | Source | Pattern |
|---|---|---|
| Stockage JSON pour config structurée | `backend/src/services/config.ts` (AppConfig), et `referencement/backend/src/prisma/schema.prisma` (`Program.categories`/`intCriteria`) | Un modèle avec colonnes `Json` plutôt qu'un éclatement en tables relationnelles, quand la structure est toujours lue/écrite en bloc |
| Matching nom de champ Jira | `frontend/src/lib/issueFieldGroups.ts:normalize()` + `backend/src/lib/jira.ts:findFieldIdByName()` | Même logique de normalisation (trim, `:` final, casse) des deux côtés — à généraliser, pas à dupliquer une 3e fois |
| Extraction générique de champs | `backend/src/lib/jira.ts:extractFieldValue/extractScalarFieldValue` | Réutilisés tels quels, aucune régression sur ce point |
| Filtrage par rôle côté frontend | `IssueDetailDrawer.tsx` (masquage "Autres"/"Réalisation") | Le même principe (filtrage client-side sur `user.role`, pas une frontière de sécurité serveur) s'applique au nouveau système, juste piloté par données au lieu d'un `Set` figé |
| Seed idempotent au démarrage | `backend/src/prisma/seed.ts:seedAdmin()` (vérifie l'existant avant de créer) | Même schéma pour la migration automatique v1→v2 : ne rien faire si des `SavedQuery` existent déjà |
| Migration offline sans DB | `prisma migrate diff --from-empty --to-schema-datamodel --script` (Phase 7 de la v1) | Même technique pour générer la migration Prisma du nouveau modèle `SavedQuery` |
| CRUD admin + audit | `backend/src/routes/admin.ts` (branding, users) | Même structure : validation, mutation, `logAction(...)`, réponse |

## Fichiers à créer / modifier

| Fichier | Action | Raison |
|---|---|---|
| `backend/src/prisma/schema.prisma` | Modifier | Ajout du modèle `SavedQuery` |
| `backend/src/prisma/migrations/<ts>_add_saved_query/migration.sql` | Créer | Migration générée offline |
| `backend/src/services/savedQueries.ts` | Créer | CRUD + résolution JQL/colonnes/onglets par requête |
| `backend/src/services/legacyQueryMigration.ts` | Créer | Migration automatique v1 → "Requête 1", idempotente |
| `backend/src/prisma/seed.ts` | Modifier | Appeler la migration legacy après le seed admin |
| `backend/src/routes/queries.ts` | Créer | `GET /api/queries`, liste/détail/pièces jointes scopés par requête (remplace `issues.ts`) |
| `backend/src/routes/issues.ts` | Supprimer | Remplacé par `queries.ts` (JQL unique obsolète) |
| `backend/src/routes/admin.ts` | Modifier | CRUD `/api/admin/queries` + `GET /api/admin/jira-fields` |
| `backend/src/services/audit.ts` | Modifier | Actions `SAVE_QUERY`, `DELETE_QUERY` |
| `backend/src/app.ts` | Modifier | Monter `queries.ts`, retirer `issues.ts` |
| `backend/test/savedQueries.test.ts` | Créer | Tests service (résolution, migration legacy) |
| `backend/test/queries.routes.test.ts` | Créer | Tests routes liste/détail/pièces jointes par requête |
| `backend/test/admin.routes.test.ts` | Modifier | Tests CRUD requêtes + jira-fields |
| `frontend/src/types/query.ts` | Créer | Types `SavedQuery`, `QueryTab`, `QueryListColumn` |
| `frontend/src/hooks/useQueries.ts` | Créer | `useQueriesNav`, `useQueryIssues`, `useQueryIssue` |
| `frontend/src/lib/issueFieldGroups.ts` | Modifier | `groupIssueFields(fields, tabsConfig)` paramétrée au lieu d'une constante statique |
| `frontend/src/components/Layout.tsx` | Modifier | Nav dynamique (un onglet par requête) |
| `frontend/src/pages/IssueList.tsx` | Modifier | Paramétrée par `queryId`, colonnes/filtres dynamiques |
| `frontend/src/components/IssueDetailDrawer.tsx` | Modifier | Paramétrée par `queryId`, onglets dynamiques |
| `frontend/src/App.tsx` | Modifier | Route `/queries/:queryId`, redirection `/` → première requête |
| `frontend/src/pages/admin/AdminQueries.tsx` | Créer | Liste des requêtes (créer/supprimer/réordonner) |
| `frontend/src/pages/admin/AdminQueryEditor.tsx` | Créer | Édition d'une requête (nom, JQL, colonnes, onglets) |
| `frontend/src/components/FieldPicker.tsx` | Créer | Sélecteur multi-champs alimenté par `/api/admin/jira-fields` |
| `frontend/src/components/TabEditor.tsx` | Créer | Éditeur d'un onglet (libellé, champs, visibilité par rôle) |
| `frontend/src/pages/admin/AdminLayout.tsx` | Modifier | Lien nav "Requêtes" |
| `frontend/test/*.test.tsx` | Créer/Modifier | Tests des nouveaux composants + adaptation des tests existants |
| `frontend/e2e/*.spec.ts` | Modifier | Adapter les parcours E2E à la navigation par requête |

## Phases

### Phase 1 — Modèle de données + migration Prisma
- **Action** : ajouter `SavedQuery` au schéma, générer la migration offline (`prisma migrate diff --from-empty --to-schema-datamodel`), l'intégrer dans `backend/src/prisma/migrations/`.
- **Validation** : `npx prisma validate`, `npm run build` (génération client Prisma OK).

### Phase 2 — Service `savedQueries` + migration automatique v1→v2
- **Action** : `savedQueries.ts` (CRUD + `getQueryOrThrow`), `legacyQueryMigration.ts` (lit `AppConfig.jql` ou `JIRA_JQL`, crée "Requête 1" avec les 5 onglets actuels + colonnes Profil/Offre Export si aucune `SavedQuery` n'existe). Appelée depuis `seed.ts` (même point d'entrée que le seed admin, même idempotence).
- **Mirror** : `seedAdmin()` (vérifie l'existant avant d'agir).
- **Validation** : tests unitaires (fakePrisma) : migration crée bien "Requête 1" une seule fois, ne fait rien si des requêtes existent déjà, fonctionne même sans JQL préexistant (fallback JQL vide + onglets par défaut, pas d'échec).

### Phase 3 — Endpoints `/api/queries/*` (remplace `/api/issues/*`)
- **Action** : `queries.ts` avec les 4 routes de la spec, résolution des `listColumns`/JQL depuis la `SavedQuery`, audit `VIEW_LIST`/`VIEW_ISSUE`/`DOWNLOAD_ATTACHMENT` avec `entityType` incluant l'id de requête. Suppression de `issues.ts` et de son montage dans `app.ts`.
- **Mirror** : `issues.ts` actuel presque intégralement, juste paramétré par `queryId`.
- **Validation** : tests d'intégration (fakePrisma + JiraClient mocké, comme `issues.routes.test.ts` actuel) migrés vers `queries.routes.test.ts`.

### Phase 4 — Endpoints admin `/api/admin/queries` + `/api/admin/jira-fields`
- **Action** : CRUD complet (create/update/delete/reorder), validation (nom non vide, JQL non vide, au moins... aucune contrainte de structure imposée sur `tabs`/`listColumns` au-delà du typage), audit `SAVE_QUERY`/`DELETE_QUERY`. `GET /api/admin/jira-fields` réutilise `JiraClient.getFieldsMeta()`.
- **Mirror** : `admin.ts` (branding CRUD, users CRUD) pour le style des handlers et de la validation.
- **Validation** : tests de rôle (403 USER), CRUD complet, audit vérifié.

### Phase 5 — Frontend : navigation dynamique + liste/détail paramétrés
- **Action** : `useQueries.ts`, `Layout.tsx` (nav dynamique), `App.tsx` (route `/queries/:queryId`, redirection racine), `IssueList.tsx` (colonnes dynamiques depuis `listColumns`), `groupIssueFields` généralisée, `IssueDetailDrawer.tsx` paramétrée par `queryId` + config d'onglets récupérée.
- **Mirror** : structure actuelle de ces composants, juste rendue data-driven.
- **Validation** : tests unitaires adaptés (IssueList, IssueDetailDrawer, issueFieldGroups) avec une config d'onglets passée en paramètre au lieu de l'import statique.

### Phase 6 — Frontend : UI d'administration des requêtes
- **Action** : `FieldPicker.tsx` (sélecteur autocomplete), `TabEditor.tsx` (onglet : libellé, champs, toggle rôle, réordonner/supprimer — sauf "Autres" non supprimable, juste son toggle), `AdminQueryEditor.tsx` (nom, JQL, section colonnes de liste, liste d'onglets), `AdminQueries.tsx` (liste, créer, supprimer, réordonner), lien nav dans `AdminLayout.tsx`.
- **Mirror** : `AdminBranding.tsx`/`AdminUsers.tsx` pour le style de formulaire et les patterns de mutation React Query.
- **Validation** : tests unitaires du `FieldPicker` et du flux de création/édition d'une requête ; E2E couvrant création d'une requête avec un onglet custom → apparition de l'onglet dans le drawer.

### Phase 7 — Docker + vérification de bout en bout
- **Action** : `docker compose up --build` en local avec une base vide (vérifie la migration auto crée "Requête 1"), puis avec la base existante de la v1 (vérifie la migration reprend le JQL/onglets existants sans interruption).
- **Validation** : les deux scénarios testés manuellement, `npm test` (backend+frontend) verts, `npx playwright test` vert.

### Phase 8 — Revue + PR vers `main`
- **Action** : agent de revue (code-reviewer + security-reviewer) sur le diff complet de la branche, corrections, puis PR `feature/multi-jql-queries` → `main` (la v1 reste taguée `v1` et disponible en rollback).
- **Validation** : checklist ci-dessous, CI verte, PR ouverte avec plan de test.

## Commandes de validation

```bash
cd backend && npm run db:migrate && npm test && npm run build
cd frontend && npm test && npm run build && npx playwright test
docker compose up --build
```

## Risques

Voir `05-multi-jql-specification.md` section "Risques" (UI admin complexe, regroupement dynamique, migration silencieuse, volume non borné).

## Critères d'acceptation

- [ ] Migration automatique validée sur base vide ET sur base v1 existante
- [ ] Navigation affiche un onglet par requête, dans l'ordre configuré
- [ ] Liste et détail respectent les colonnes/onglets/champs configurés par requête
- [ ] Visibilité par rôle (onglets, "Autres") fonctionne comme avant, mais pilotée par données
- [ ] UI admin permet de créer/éditer/supprimer une requête et ses onglets sans toucher au code
- [ ] `npm test` backend + frontend verts, couverture maintenue ≥ 80%
- [ ] `docker compose up --build` fonctionnel de bout en bout
- [ ] Revue par agent effectuée, PR ouverte vers `main`
