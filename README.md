# jira-issue-viewer

Application de consultation d'issues Jira Data Center selon une requête JQL globale modifiable, avec affichage des champs renseignés et des pièces jointes. Deux rôles : `ADMIN` (configuration, gestion des comptes, logs d'audit) et `USER` (lecture seule).

## Documentation de cadrage

Voir `docs/planning/` pour la démarche complète :

- [`01-brainstorming.md`](docs/planning/01-brainstorming.md) — analyse du projet de référence et patterns réutilisés
- [`02-specification.md`](docs/planning/02-specification.md) — questions de cadrage, décisions validées, spec technique
- [`03-implementation-plan.md`](docs/planning/03-implementation-plan.md) — plan d'implémentation par phases

## Stack

- Backend : Node.js + TypeScript, Express, Prisma, PostgreSQL
- Frontend : React + Vite + TypeScript, TanStack Query
- Déploiement : Docker Compose (`db`, `backend`, `frontend`), Coolify via GitHub

## Variables d'environnement

Copier `.env.example` vers `.env` à la racine (utilisé par `docker-compose.yml`) et renseigner les valeurs — voir les commentaires du fichier. Générer `JWT_SECRET`, `JWT_REFRESH_SECRET` et `ENCRYPTION_KEY` avec `openssl rand -hex 32` (une valeur différente pour chacun).

## Démarrage avec Docker Compose (recommandé)

```bash
cp .env.example .env
# éditer .env : mots de passe, secrets, URL/PAT Jira, compte admin initial

docker compose up --build
```

- Frontend : http://localhost:8070 (port configurable via `APP_PORT`)
- Backend (API directe, utile pour déboguer) : http://localhost:3001 (port configurable via `BACKEND_PORT`)
- Au premier démarrage, le backend applique les migrations Prisma puis seed le compte admin initial (`ADMIN_EMAIL`/`ADMIN_PASSWORD`).

Pour tout réinitialiser (⚠️ supprime les données) :

```bash
docker compose down -v
```

## Démarrage en local sans Docker (développement)

Nécessite un PostgreSQL local et un fichier `backend/.env` (voir `backend/src/prisma/schema.prisma` pour les variables attendues : `DATABASE_URL`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, `ENCRYPTION_KEY`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`).

```bash
# Backend
cd backend
npm install
npm run db:migrate
npm run db:seed
npm run dev        # http://localhost:3001

# Frontend (autre terminal)
cd frontend
npm install
npm run dev         # http://localhost:5173, proxy /api -> localhost:3001
```

## Tests

```bash
# Backend
cd backend && npm test

# Frontend (unitaires)
cd frontend && npm test

# Frontend (E2E Playwright, mocke /api au niveau réseau — pas besoin de backend/DB/Jira réels)
cd frontend && npx playwright install chromium   # une seule fois
npm run build && npm run test:e2e
```

## Déploiement sur Coolify

1. Pousser ce dépôt sur GitHub.
2. Dans Coolify, créer une nouvelle ressource **Docker Compose** pointant vers ce dépôt (branche `main`), fichier `docker-compose.yml` à la racine.
3. Renseigner dans Coolify les variables d'environnement listées dans `.env.example` (secrets générés, URL/PAT Jira, compte admin initial). Ne jamais committer le `.env` réel.
4. Exposer le service `frontend` (port `80` interne) via le domaine Coolify ; le service `backend` n'a pas besoin d'être exposé publiquement (le frontend nginx relaie `/api` en interne sur le réseau Docker).
5. Activer le déploiement automatique sur push vers `main`.
6. Premier déploiement : vérifier les logs du service `backend` (migrations Prisma + seed admin), puis se connecter avec `ADMIN_EMAIL`/`ADMIN_PASSWORD` et configurer le JQL/PAT définitifs depuis `/admin/config` si différents des valeurs d'environnement initiales.
