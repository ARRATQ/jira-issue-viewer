# Plan d'implémentation — jira-issue-viewer

Date : 2026-08-03
Statut : en attente de confirmation avant démarrage de la Phase 0
Référence : `02-specification.md` (spec validée)

## Patterns à reprendre (depuis referencement)

| Catégorie | Source | Pattern |
|---|---|---|
| Client Jira | `referencement/backend/src/services/jira.js:27-48` | `jiraFetch` : agent HTTPS `rejectUnauthorized:false`, header Authorization construit une fois, gère 204/JSON |
| Extraction champs | `referencement/backend/src/services/jira.js:60-86` | `extractFieldValue` générique + `/rest/api/2/field` pour mapper `customfield_*` → nom lisible |
| Auth middleware | `referencement/backend/src/middleware/auth.js` | JWT Bearer, `req.user` peuplé, 401 clair |
| Rôles middleware | `referencement/backend/src/middleware/roles.js` | `requireRole(...roles)` + rank pour min-role |
| Schéma Prisma | `referencement/backend/src/prisma/schema.prisma` | `User`, `AuditLog`, `AppConfig` — adaptés (Role à 2 valeurs, AuditLog avec `entityType`/`entityKey`) |
| Docker/déploiement | `referencement/docker-compose.yml`, `backend/Dockerfile` | 1 service par composant, `entrypoint.sh` migrate+seed avant start, healthcheck Postgres |
| Tests backend | `referencement/backend/test/*.test.js` | Fonctions pures testées isolément sans DB/HTTP |

Pas d'équivalent React côté referencement (Vue) — le frontend suit `~/.claude/rules/ecc/web/coding-style.md` (organisation par feature) et `web/patterns.md` (container/presentational, TanStack Query).

## Fichiers à créer

| Fichier | Raison |
|---|---|
| `backend/src/prisma/schema.prisma` | User, AuditLog, AppConfig |
| `backend/src/lib/jira.ts` | Client Jira DC (PAT, search, issue detail, attachment stream, field metadata) |
| `backend/src/middleware/auth.ts`, `roles.ts` | JWT + rôles (2 valeurs) |
| `backend/src/routes/auth.ts`, `issues.ts`, `admin.ts` | Endpoints de la spec |
| `backend/src/services/audit.ts` | `logAction(userId, action, details, req)` centralisé |
| `backend/src/app.ts`, `server.ts` | Express app + bootstrap (seed admin depuis env) |
| `backend/Dockerfile`, `entrypoint.sh` | Build + migrate + seed |
| `backend/test/*.test.ts` | Unitaires (extraction champs Jira, mapper audit) + intégration (endpoints via supertest) |
| `frontend/src/pages/{Login,IssueList,IssueDetail,AdminConfig,AdminUsers,AdminAuditLogs}.tsx` | Pages principales |
| `frontend/src/hooks/useIssues.ts`, `useAuth.ts` | Hooks TanStack Query |
| `frontend/src/components/AttachmentPreview.tsx` | Aperçu image/PDF + fallback téléchargement |
| `frontend/Dockerfile`, `nginx.conf` | Build statique + proxy `/api` |
| `docker-compose.yml`, `.env.example` | Orchestration 3 services |
| `frontend/e2e/*.spec.ts` | Playwright : login → liste → détail → download |
| `README.md`, `CLAUDE.md` | Doc setup + conventions projet |

## Tâches par phase

### Phase 0 — Bootstrap projet
- **Action** : `git init`, structure `backend/` + `frontend/`, `.gitignore`, `.env.example`, README minimal.
- **Mirror** : structure top-level de `referencement/` (backend/frontend séparés, pas de monorepo tool).
- **Validation** : `git status` propre, dossiers créés.

### Phase 1 — Backend : fondations (Prisma, auth, rôles)
- **Action** : `schema.prisma` (User 2 rôles, AuditLog, AppConfig), migration initiale, seed admin depuis `ADMIN_EMAIL`/`ADMIN_PASSWORD`, middlewares `auth.ts`/`roles.ts`, routes `/api/auth/login`, `/api/auth/refresh`.
- **Mirror** : `referencement/backend/src/middleware/*`, `prisma/seed.js`.
- **Validation** : `npm run db:migrate && npm test` (middleware avec tokens valides/invalides).

### Phase 2 — Backend : client Jira + audit
- **Action** : `lib/jira.ts` (PAT bearer, `searchIssues(jql)`, `getIssue(key)`, extraction champs génériques + noms via `/rest/api/2/field`, `getAttachmentStream(url)`), `services/audit.ts`, gestion TLS interne via env (`JIRA_TLS_REJECT_UNAUTHORIZED`, défaut false, ou `JIRA_CA_CERT`).
- **Mirror** : `referencement/backend/src/services/jira.js` (jiraFetch, extractFieldValue, getFieldsMeta) — simplifié, sans les mappers métier `INTERVENANT_FIELDS`/`COMPETENCE_FIELDS`.
- **Validation** : tests unitaires (`extractFieldValue`, parsing) avec fixtures JSON Jira ; tests d'intégration avec Jira mocké (nock/msw) pour `searchIssues`/`getIssue`.

### Phase 3 — Backend : endpoints issues + admin
- **Action** : `GET /api/issues` (JQL courant, log VIEW_LIST), `GET /api/issues/:key` (log VIEW_ISSUE), `GET /api/issues/:key/attachments/:id` (stream + log DOWNLOAD_ATTACHMENT), `GET/PUT /api/admin/config` (JQL + URL Jira + PAT masqué en lecture, log UPDATE_CONFIG, ADMIN only), `GET/POST/PATCH /api/admin/users` (log CREATE/UPDATE/DEACTIVATE_USER), `GET /api/admin/audit-logs` (pagination + filtres).
- **Mirror** : pattern routes Express de referencement + `requireRole`.
- **Validation** : tests d'intégration supertest (401/403 par rôle, logs créés en DB après chaque appel).

### Phase 4 — Frontend : auth + layout
- **Action** : page Login, `useAuth` (stockage JWT, refresh), layout avec nav conditionnée par rôle, route guard React Router.
- **Mirror** : `web/coding-style.md` (organisation par feature) et `web/patterns.md` (TanStack Query pour le state serveur).
- **Validation** : test unitaire du hook `useAuth`, navigation manuelle en dev server.

### Phase 5 — Frontend : liste + détail + pièces jointes
- **Action** : `IssueList` (tableau des issues du JQL courant), `IssueDetail` (tous les champs renseignés avec nom lisible), `AttachmentPreview` (image/PDF inline, fallback téléchargement).
- **Mirror** : format des données du backend (Phase 3) ; `web/performance.md` pour lazy loading des images.
- **Validation** : tests unitaires composants clés + Playwright E2E (liste → détail → téléchargement PJ).

### Phase 6 — Frontend : admin (config, users, audit logs)
- **Action** : page config JQL/URL/PAT, page gestion users (créer/désactiver), page audit logs (table filtrable/paginée).
- **Mirror** : mêmes conventions que Phase 5.
- **Validation** : Playwright E2E parcours admin (édition JQL → vérifier que la liste change).

### Phase 7 — Docker + déploiement Coolify
- **Action** : Dockerfiles backend/frontend, `docker-compose.yml` (db+backend+frontend, sans service proxy), `entrypoint.sh` (migrate+seed), `nginx.conf` (proxy `/api`), `.env.example` complet, README section déploiement Coolify (repo GitHub, variables d'env à définir dans Coolify).
- **Mirror** : `referencement/docker-compose.yml` et `backend/Dockerfile`.
- **Validation** : `docker compose up --build` en local, healthcheck Postgres OK, login + liste fonctionnels via le port exposé.

### Phase 8 — Validation finale (agent dédié) + PR
- **Action** : lancer un agent de revue (code-reviewer + security-reviewer) pour vérifier l'implémentation contre ce plan et la spec validée ; corriger les écarts ; ouvrir la PR avec plan de test.
- **Mirror** : `common/code-review.md`, `common/security.md`.
- **Validation** : checklist ci-dessous cochée, `npm test` (backend+frontend) vert, `docker compose up` fonctionnel, PR créée.

## Commandes de validation

```bash
# Backend
cd backend && npm run db:migrate && npm test

# Frontend
cd frontend && npm test && npx playwright test

# Full stack
docker compose up --build
```

## Risques

Voir `02-specification.md` section "Risques identifiés" (TLS interne, PAT en clair, volume de logs, types de PJ non standard).

## Critères d'acceptation

- [ ] Toutes les phases complétées et validées individuellement
- [ ] `npm test` backend + frontend verts, couverture ≥ 80%
- [ ] `docker compose up --build` fonctionnel de bout en bout
- [ ] Rôles ADMIN/USER respectés sur tous les endpoints (tests 401/403)
- [ ] Chaque vue/action génère bien une entrée AuditLog
- [ ] PAT Jira jamais exposé au frontend ni dans les logs
- [ ] Revue par agent de validation effectuée, PR ouverte avec plan de test
