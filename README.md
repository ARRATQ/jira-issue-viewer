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

## Démarrage (à venir)

Le setup local (`npm install`, migrations Prisma, `docker compose up`) sera documenté au fur et à mesure de l'implémentation (voir le plan par phases).

## Variables d'environnement

Copier `.env.example` vers `.env` et renseigner les valeurs (voir les commentaires du fichier).
