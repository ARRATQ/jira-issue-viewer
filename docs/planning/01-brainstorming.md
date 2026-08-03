# Brainstorming — jira-issue-viewer

Date : 2026-08-03

## Demande initiale

Nouveau projet simple ayant pour but d'afficher des données depuis une plateforme Jira Data Center selon une requête JQL modifiable, affichant des issues d'un certain type avec les champs renseignés pour ces tickets ainsi que les pièces jointes (attachments).

Deux rôles :
- **admin** : tous les pouvoirs
- **user** : visualisation uniquement

Exigence transverse : log détaillé de **qui voit quoi** et **qui fait quoi**.

Contrainte technique : TypeScript. Déploiement Docker sur un serveur géré par Coolify, installation prise en charge via GitHub.

Référence à étudier pour inspiration/amélioration : `/home/abdelaziz/Creations/Code/Projets/referencement/` (connexion Jira + gestion des rôles).

## Analyse du projet de référence (`referencement`)

Stack observée :
- Backend : Node.js CommonJS, Express, Prisma ORM, PostgreSQL, JWT (jsonwebtoken), bcryptjs
- Frontend : Vue 3 + Vite
- Déploiement : `docker-compose.yml` avec 4 services (`db` Postgres, `proxy` Node relais CORS Jira/OpenRouter, `backend` Express, `frontend` nginx) sur Coolify via GitHub

Éléments réutilisables/inspirants identifiés :

1. **Service Jira** (`backend/src/services/jira.js`)
   - `jiraFetch(path, options)` : helper central, agent HTTPS `rejectUnauthorized:false` (certificat interne), header `Authorization` construit selon le mode (`Basic` ou `Bearer` PAT) lu depuis une table `AppConfig` en DB, gère les réponses 204 (pas de corps JSON à parser).
   - `searchIssues(jql, fields, maxResults)` → `GET /rest/api/2/search`.
   - `getIssue(key, fields)` → `GET /rest/api/2/issue/:key`.
   - `extractFieldValue(v)` : normalise récursivement une valeur de champ Jira (string/number/bool, tableau, objet avec `.value`/`.displayName`/`.name`) en valeur affichable.
   - `getFieldsMeta()` → `GET /rest/api/2/field`, construit une map `customfield_id → nom lisible`.
   - `fetchAttachmentBuffer(contentUrl)` : télécharge le contenu d'une pièce jointe avec l'auth Jira (le frontend n'a jamais accès direct à Jira).
   - Fonctions métier spécifiques à referencement (`extractIntervenantData`, `resolveIntervenantFields`, `INTERVENANT_FIELDS`, `COMPETENCE_FIELDS`, etc.) : **non pertinentes** pour jira-issue-viewer, qui n'a pas de formulaire de saisie ni de mapping métier figé — juste un affichage générique des champs renseignés.

2. **Auth & rôles**
   - `middleware/auth.js` : vérifie un JWT Bearer, peuple `req.user`, renvoie 401 clair si absent/invalide.
   - `middleware/roles.js` : `requireRole(...roles)` (liste blanche) et `requireMinRole(minRole)` (hiérarchie `ROLE_RANK`). Pattern directement réutilisable avec un rôle à 2 valeurs (ADMIN/USER) au lieu de 3.

3. **Modèle de données Prisma** (`backend/src/prisma/schema.prisma`)
   - `User { id, email, passwordHash, name, role, active, createdAt, updatedAt }`
   - `AuditLog { id, userId, action, details(Json), ipAddress, createdAt }` — déjà pensé pour la traçabilité, mais dans referencement il ne logue que des actions de mutation (pas les vues). Pour jira-issue-viewer, il faudra étendre l'usage pour logger aussi les vues (liste, détail, téléchargement PJ), conformément à l'exigence explicite "qui voit quoi".
   - `AppConfig { key, value, encrypted }` : stockage clé/valeur générique, utilisé pour l'URL Jira, le mode d'auth, les credentials. Pattern réutilisable pour stocker le JQL global + la config Jira (URL + PAT).

4. **Déploiement**
   - `docker-compose.yml` : un service par composant, `depends_on` avec `condition: service_healthy` pour Postgres, variables d'env `.env` → conteneurs, ports mappés configurables via env.
   - `backend/Dockerfile` : `node:20-slim`, install deps prod uniquement, `prisma generate`, `entrypoint.sh` exécutable qui migre + seed avant de démarrer (pattern à reprendre pour le seed du compte admin initial).
   - Le service `proxy` de referencement sert à la fois de relais CORS Jira et de relais vers OpenRouter (IA) — jira-issue-viewer n'a pas besoin d'IA et le backend peut appeler Jira directement (décision validée en phase questions), donc **pas de service proxy dédié**.

5. **Tests**
   - Tests unitaires ciblés sur des fonctions pures (mappers d'historique, scoring, extraction de champs), sans dépendance DB/HTTP — bon pattern à reproduire pour les tests du client Jira générique.

## Écarts majeurs entre referencement et jira-issue-viewer

| Aspect | referencement | jira-issue-viewer |
|---|---|---|
| But | Outil métier de scoring/évaluation de prestataires avec écriture retour vers Jira | Outil de consultation en lecture seule d'issues Jira |
| Écriture Jira | Oui (`updateIssueFields`, `addComment`) | Non — lecture seule |
| Champs | Mapping métier figé (11 champs intervenant, 7 champs compétence) | Générique : tous les champs renseignés de l'issue, peu importe lesquels |
| Rôles | 3 (PARTICIPANT/GESTIONNAIRE/ADMIN) avec logique métier de workflow | 2 (USER/ADMIN), simple lecture vs administration |
| Frontend | Vue 3 | React (décision validée, cf. 02-specification.md) |
| Proxy Jira | Service Node dédié | Appel direct depuis le backend (décision validée) |
| Audit | Logue les mutations | Logue aussi explicitement les vues (liste/détail/téléchargement) |

## Conclusion du brainstorming

Le projet de référence fournit un socle solide et éprouvé (auth JWT, rôles, client Jira générique, déploiement Coolify) qu'il est pertinent de porter en TypeScript en le simplifiant : suppression de toute la logique métier de scoring/évaluation, suppression du service proxy, généralisation totale de l'extraction des champs, et ajout d'un logging de vue systématique absent de referencement.

Passage à la phase de questions de cadrage → voir `02-specification.md` pour les décisions validées.
