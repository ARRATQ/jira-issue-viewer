export interface IssueSummary {
  key: string;
  summary: string;
  status: string | null;
  issueType: string | null;
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

export interface IssueDetail extends IssueSummary {
  fields: IssueField[];
  attachments: AttachmentMeta[];
}

export interface IssuesResponse {
  jql: string;
  issues: IssueSummary[];
}
