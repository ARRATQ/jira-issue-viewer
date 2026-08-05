import type { FieldRef, QueryTab } from './query';

export interface IssueBase {
  key: string;
  summary: string;
  status: string | null;
  issueType: string | null;
}

// Vue liste : les colonnes métier supplémentaires sont désormais dynamiques,
// pilotées par les `listColumns` de la requête. Chaque valeur est indexée par
// le nom de champ Jira (clé identique à `listColumns[].fieldName`).
export interface IssueSummary extends IssueBase {
  extraFields: Record<string, string | null>;
}

export interface IssueField {
  id: string;
  name: string;
  value: unknown;
}

export interface AttachmentMeta {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  contentUrl: string;
  authorId: string | null;
  authorName: string | null;
}

// Vue détail : tous les champs renseignés sont déjà dans `fields`.
// reporterId permet de filtrer les pièces jointes par déposant.
export interface IssueDetail extends IssueBase {
  fields: IssueField[];
  attachments: AttachmentMeta[];
  reporterId: string | null;
  reporterName: string | null;
}

// Réponse de GET /api/queries/:queryId/issues : la liste des issues plus la
// config de la requête (colonnes de liste + onglets du drawer) pour rendre la
// vue entièrement pilotée par les données, sans requête supplémentaire.
export interface QueryIssuesResponse {
  queryId: string;
  queryName: string;
  jql: string;
  listColumns: FieldRef[];
  tabs: QueryTab[];
  autresVisibleToUser: boolean;
  issues: IssueSummary[];
}
