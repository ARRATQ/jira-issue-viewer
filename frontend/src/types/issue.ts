export interface IssueBase {
  key: string;
  summary: string;
  status: string | null;
  issueType: string | null;
}

// Vue liste : quelques champs métier supplémentaires affichés en colonnes.
export interface IssueSummary extends IssueBase {
  profilExport: string | null;
  offreExport: string | null;
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
}

// Vue détail : tous les champs renseignés sont déjà dans `fields`.
export interface IssueDetail extends IssueBase {
  fields: IssueField[];
  attachments: AttachmentMeta[];
}

export interface IssuesResponse {
  jql: string;
  issues: IssueSummary[];
}
