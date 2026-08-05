// Types miroir du modèle backend `SavedQuery` (voir
// backend/src/services/savedQueries.ts). fieldId est informationnel — le
// regroupement des champs se fait par nom normalisé, comme côté backend.
export interface FieldRef {
  fieldName: string;
  fieldId?: string;
}

export interface QueryTab {
  id: string;
  label: string;
  position: number;
  visibleToUser: boolean;
  fields: FieldRef[];
}

// Résumé renvoyé par GET /api/queries pour construire la navigation.
export interface SavedQuerySummary {
  id: string;
  name: string;
  position: number;
}

export interface QueriesResponse {
  queries: SavedQuerySummary[];
}

// Enregistrement complet d'une requête, tel que renvoyé par les endpoints
// d'administration (GET/POST/PUT /api/admin/queries).
export interface SavedQuery {
  id: string;
  name: string;
  jql: string;
  position: number;
  listColumns: FieldRef[];
  tabs: QueryTab[];
  autresVisibleToUser: boolean;
  createdAt: string;
  updatedAt: string;
}

// Champ du catalogue Jira (GET /api/admin/jira-fields), pour le sélecteur.
export interface JiraFieldMeta {
  id: string;
  name: string;
}
