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
