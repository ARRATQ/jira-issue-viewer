# Spécification technique validée — jira-issue-viewer

Date : 2026-08-03
Statut : **validée par l'utilisateur** le 2026-08-03

## Questions posées et décisions

### Round 1

| Question | Options proposées | Décision |
|---|---|---|
| Frontend | React+Vite vs Vue+Vite | **React + Vite** |
| Auth Jira | PAT (Bearer) uniquement vs Basic+PAT configurable | **PAT (Bearer) uniquement** |
| Modèle JQL | Un JQL global unique vs plusieurs requêtes nommées | **Un JQL global unique** |
| Granularité audit "qui voit quoi" | Log liste+détail+téléchargement PJ vs actions seulement | **Log par ouverture de ticket + téléchargement PJ** (+ liste) |

### Round 2

| Question | Options proposées | Décision |
|---|---|---|
| Nom/emplacement projet | `jira-issue-viewer` vs `jira-dashboard` | **`jira-issue-viewer`**, sous `/home/abdelaziz/Creations/Code/Projets/` |
| Gestion des comptes | Création manuelle par l'admin vs auto-inscription+validation | **Création manuelle par l'admin** (admin seedé via env, puis crée/désactive les users) |
| Pièces jointes | Aperçu inline (images/PDF) + téléchargement vs téléchargement seul | **Aperçu inline (images/PDF) + téléchargement** pour les autres types |
| TLS Jira | Certificat interne/auto-signé vs certificat public valide | **Certificat interne/auto-signé** → désactivation de la vérification stricte côté backend (configurable) |

### Round 3

| Question | Options proposées | Décision |
|---|---|---|
| Architecture d'appel Jira | Appel direct backend→Jira vs service proxy dédié (comme referencement) | **Appel direct depuis le backend**, pas de service proxy séparé |

## Spécification consolidée

### Stack
- **Backend** : Node.js + TypeScript, Express, Prisma ORM, PostgreSQL
- **Frontend** : React + Vite + TypeScript, TanStack Query (état serveur), React Router
- **Auth** : JWT (access + refresh), bcrypt pour les mots de passe
- **Déploiement** : Docker Compose (3 services : `db`, `backend`, `frontend`) → Coolify via GitHub (build auto sur push)

### Modèle de données (Prisma)

```prisma
enum Role {
  ADMIN
  USER
}

model User {
  id           String     @id @default(uuid())
  email        String     @unique
  passwordHash String
  name         String
  role         Role       @default(USER)
  active       Boolean    @default(true)
  auditLogs    AuditLog[]
  createdAt    DateTime   @default(now())
  updatedAt    DateTime   @updatedAt
}

model AppConfig {
  key       String   @id
  value     String   @db.Text
  encrypted Boolean  @default(false)
  updatedAt DateTime @updatedAt
}
// clés utilisées : jira_url, jira_pat (encrypted=true), jql

model AuditLog {
  id         String   @id @default(uuid())
  userId     String
  user       User     @relation(fields: [userId], references: [id])
  action     String   // LOGIN, LOGIN_FAILED, VIEW_LIST, VIEW_ISSUE, DOWNLOAD_ATTACHMENT,
                       // UPDATE_CONFIG, CREATE_USER, UPDATE_USER, DEACTIVATE_USER
  entityType String?  // "issue", "user", "config"
  entityKey  String?  // ex. clé Jira "PROJ-123", ou id user
  details    Json?
  ipAddress  String?
  createdAt  DateTime @default(now())

  @@index([userId])
  @@index([action])
  @@index([createdAt])
}
```

### Intégration Jira Data Center

- Service `jira.ts` côté backend uniquement (jamais exposé au frontend) : auth Bearer PAT, agent HTTPS avec `rejectUnauthorized: false` par défaut (cert interne), configurable via variable d'env (`JIRA_TLS_REJECT_UNAUTHORIZED`) ou CA fourni (`JIRA_CA_CERT`).
- `GET /rest/api/2/search` avec le JQL stocké en config (`AppConfig.jql`), `fields=*all` pour l'issue en détail.
- Extraction générique des champs renseignés (standard + `customfield_*`) avec leur nom lisible via `/rest/api/2/field`, **sans mapping métier figé** (contrairement à referencement).
- Proxy des pièces jointes : le backend télécharge le contenu via le PAT et le ressert au frontend (le frontend n'a jamais le PAT ni un accès direct à Jira).
- Le PAT n'est **jamais** renvoyé en clair dans les réponses API (masqué côté `GET /api/admin/config`).

### Rôles & permissions

- **ADMIN** : tout ce que peut faire USER + gérer les comptes (créer/désactiver), configurer l'URL Jira + le PAT, éditer le JQL global, consulter les logs d'audit.
- **USER** : lister les issues (JQL courant), voir le détail + champs + pièces jointes. Aucune écriture côté Jira, aucune administration.

### API (esquisse)

```
POST   /api/auth/login
POST   /api/auth/refresh

GET    /api/issues                        → liste (JQL courant), log VIEW_LIST
GET    /api/issues/:key                   → détail + champs, log VIEW_ISSUE
GET    /api/issues/:key/attachments/:id   → stream fichier, log DOWNLOAD_ATTACHMENT

GET/PUT /api/admin/config                 → JIRA_URL, JQL, PAT (masqué en lecture) — ADMIN only
GET/POST/PATCH /api/admin/users           → gestion comptes — ADMIN only
GET    /api/admin/audit-logs              → pagination/filtres (user, action, date) — ADMIN only
```

### Tests (cible 80% couverture)

- Unitaires : extraction des champs Jira (`extractFieldValue`, `getFieldsMeta`), mapping audit log, middlewares auth/roles
- Intégration : endpoints API avec base Postgres de test (Jira mocké via nock/msw)
- E2E (Playwright) : login → liste → détail → téléchargement PJ ; parcours admin (édition JQL → vérifier que la liste change)

### Déploiement

- `.env.example` avec `DATABASE_URL`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, `JIRA_URL`, `JIRA_PAT`, `JIRA_TLS_REJECT_UNAUTHORIZED`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`
- `docker-compose.yml` : Postgres + backend (Express) + frontend (nginx servant le build Vite, proxy `/api` vers backend)
- Repo GitHub → connecté à Coolify pour déploiement automatique sur push

## Risques identifiés

| Risque | Probabilité | Mitigation |
|---|---|---|
| Cert TLS interne Jira mal configuré en prod (Coolify) | Moyenne | Variable d'env explicite, documentée, jamais désactivée silencieusement sans que ce soit su |
| PAT Jira stocké en DB en clair | Moyenne | `AppConfig.encrypted=true` pour cette valeur, jamais renvoyée dans les réponses API |
| Volume élevé de logs VIEW_LIST/VIEW_ISSUE | Faible | Index sur `userId`/`action`/`createdAt`, pagination stricte sur `/api/admin/audit-logs` |
| Types de pièces jointes non standard pour l'aperçu | Faible | Fallback téléchargement systématique si le type MIME n'est pas géré côté aperçu |
