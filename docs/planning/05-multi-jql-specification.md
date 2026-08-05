# Spécification technique validée — Requêtes JQL multiples personnalisables

Date : 2026-08-05
Statut : **validée par l'utilisateur** le 2026-08-05
Branche : `feature/multi-jql-queries`

## Décisions validées

| Question | Décision |
|---|---|
| Colonnes/filtres de la liste par requête | **Configurables par requête** (plus seulement Statut/Profil Export/Offre Export fixes) |
| Saisie des champs Jira pour un onglet | **Sélecteur** alimenté par le catalogue Jira (`/rest/api/2/field`), pas de saisie libre |
| Migration de la v1 (JQL + 5 onglets actuels) | **Automatique** : seedée comme "requête n°1" au premier démarrage post-déploiement |
| Onglet "Autres" (champs non mappés) | **Toujours présent, non supprimable** ; visibilité par rôle reste configurable comme les autres onglets |

## Modèle de données

Nouveau modèle Prisma `SavedQuery`, remplaçant l'usage de `AppConfig.jql` pour le JQL global (qui devient obsolète mais peut rester en base sans effet, ou être nettoyé lors de la migration) :

```prisma
model SavedQuery {
  id          String   @id @default(uuid())
  name        String
  jql         String   @db.Text
  position    Int      @default(0)
  // Colonnes/filtres affichés dans la liste, en plus de Clé/Résumé/Statut/Type :
  // [{ "fieldId": "customfield_10020", "fieldName": "Profil Export" }, ...]
  listColumns Json     @default("[]")
  // Onglets du drawer de détail, dans l'ordre :
  // [{ "id": "infos", "label": "Infos", "position": 0, "visibleToUser": true,
  //    "fields": [{ "fieldId": "customfield_...", "fieldName": "Raison Sociale" }] }, ...]
  // Un onglet système "autres" (id fixe "autres") est toujours ajouté
  // implicitement en fin de liste au moment de l'affichage — il n'est pas
  // stocké dans ce tableau, seule sa visibilité par rôle l'est (voir
  // `autresVisibleToUser` ci-dessous).
  tabs        Json     @default("[]")
  autresVisibleToUser Boolean @default(false)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@index([position])
}
```

Justification du choix JSON (plutôt que des tables relationnelles `Tab`/`TabField`) : ces structures sont toujours lues/écrites entièrement (l'admin édite "la config d'une requête"), jamais interrogées champ par champ en SQL — même pattern que `Program.categories`/`intCriteria` dans le projet `referencement` étudié en Phase 1.

Le modèle `AppConfig` garde ses usages actuels (branding, config Jira URL/PAT/TLS, mention de confidentialité) ; seule la clé `jql` devient obsolète et n'est plus lue par le code après la migration.

## Migration automatique (v1 → v2)

Au démarrage du backend (dans `entrypoint.sh`, après les migrations Prisma, avant le seed admin — même emplacement que le seed admin actuel) :
- Si aucune ligne `SavedQuery` n'existe encore :
  - Lire l'ancien `AppConfig.jql` (ou `JIRA_JQL` en variable d'env si absent, même fallback qu'aujourd'hui)
  - Créer une `SavedQuery` nommée **"Requête 1"** avec ce JQL, position 0
  - `listColumns` = Statut (implicite, toujours présent), Profil Export, Offre Export (les 2 colonnes actuelles, résolues par nom via le catalogue Jira au moment du seed)
  - `tabs` = les 5 groupes actuels (Infos/Contact/Activités/Besoin/Réalisation et prévision) avec leurs champs actuels (repris de `frontend/src/lib/issueFieldGroups.ts`), `visibleToUser` à `true` sauf "Réalisation et prévision" à `false`
  - `autresVisibleToUser` = `false` (comportement identique à aujourd'hui)
- Si des `SavedQuery` existent déjà (déploiements suivants), ce script ne fait rien (idempotent, même pattern que le seed admin).

## API

```
GET  /api/queries                          → liste { id, name, position } pour construire la nav — authentifié, tous rôles
GET  /api/queries/:queryId/issues          → liste des issues de cette requête (JQL + listColumns), log VIEW_LIST
GET  /api/queries/:queryId/issues/:key     → détail d'une issue, regroupé selon les tabs de CETTE requête, log VIEW_ISSUE
GET  /api/queries/:queryId/issues/:key/attachments/:id → inchangé dans son fonctionnement, log DOWNLOAD_ATTACHMENT

GET    /api/admin/queries                  → liste complète (avec tabs/listColumns) — ADMIN only
POST   /api/admin/queries                  → créer une requête — ADMIN only
PUT    /api/admin/queries/:queryId         → modifier (nom, jql, position, listColumns, tabs, autresVisibleToUser) — ADMIN only
DELETE /api/admin/queries/:queryId         → supprimer — ADMIN only
GET    /api/admin/jira-fields              → catalogue Jira (id + nom lisible) pour alimenter le sélecteur de champs — ADMIN only
```

Toute mutation sur `/api/admin/queries` logue une action d'audit (réutilise `UPDATE_CONFIG`/nouvelle action `SAVE_QUERY` à trancher en plan) avec `entityType: 'saved_query'`.

## Frontend

- **Navigation** : `Layout.tsx` remplace le lien statique "Issues" par une liste dynamique d'onglets construite depuis `GET /api/queries`, un par requête (`/queries/:queryId`), triés par `position`.
- **Liste** : `IssueList` devient paramétrée par `queryId` (route param), colonnes/filtres dynamiques selon `listColumns` de la requête au lieu des colonnes fixes Profil/Offre Export.
- **Détail** : `IssueDetailDrawer` reçoit désormais aussi `queryId`, récupère la config d'onglets de cette requête (via le cache de `GET /api/queries` ou un appel dédié) et remplace `groupIssueFields()` statique par une version paramétrée par cette config (même algorithme de matching nom normalisé, source de données différente).
- **Admin** : nouvelle page(s) sous `/admin/queries` :
  - Liste des requêtes (nom, JQL, réordonner, supprimer)
  - Éditeur d'une requête : nom, JQL, liste d'onglets (ajouter/réordonner/supprimer, sauf "Autres"), par onglet : libellé + sélecteur multi-champs (alimenté par `/api/admin/jira-fields`) + toggle "visible pour USER" ; section colonnes de liste (sélecteur multi-champs similaire) ; toggle "Autres visible pour USER".

## Risques

| Risque | Probabilité | Mitigation |
|---|---|---|
| UI d'admin complexe (constructeur d'onglets imbriqué) sous-estimée en effort | Moyenne | Découper en plusieurs sous-composants réutilisables (sélecteur de champs, éditeur d'onglet, éditeur de requête) ; prévoir plusieurs itérations dans le plan |
| Regroupement de champs dynamique moins bien testé que la version statique historique | Faible | Réutiliser au maximum la même fonction pure `groupIssueFields`, paramétrée, avec la suite de tests existante adaptée |
| Migration automatique échoue silencieusement si `AppConfig.jql` absent et `JIRA_JQL` non défini | Faible | Créer quand même une "Requête 1" avec un JQL vide et les 5 onglets par défaut plutôt que d'échouer — l'admin complète ensuite |
| Nombre de requêtes/onglets non borné pouvant dégrader la nav | Faible | Pas de limite technique imposée pour l'instant (usage interne, faible volume attendu) |
