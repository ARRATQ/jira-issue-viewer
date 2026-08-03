import { Agent, fetch as undiciFetch, type Dispatcher } from 'undici';

export interface JiraConfig {
  baseUrl: string;
  pat: string;
  /** false pour un certificat interne/auto-signé (défaut : true). */
  tlsRejectUnauthorized?: boolean;
  /** CA interne en PEM, alternative à tlsRejectUnauthorized=false. */
  caCert?: string;
}

export interface JiraClientOptions {
  /** Dispatcher undici à utiliser à la place de l'agent HTTPS réel (tests). */
  dispatcher?: Dispatcher;
}

export class JiraApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: string,
  ) {
    super(`Jira API error ${status}: ${body}`);
    this.name = 'JiraApiError';
  }
}

export interface JiraField {
  id: string;
  name: string;
  value: unknown;
}

export interface JiraAttachmentMeta {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  contentUrl: string;
}

export interface JiraIssueSummary {
  key: string;
  summary: string;
  status: string | null;
  issueType: string | null;
}

export interface JiraIssueDetail extends JiraIssueSummary {
  fields: JiraField[];
  attachments: JiraAttachmentMeta[];
}

export interface JiraAttachmentStream {
  body: NonNullable<Awaited<ReturnType<typeof undiciFetch>>['body']>;
  contentType: string | null;
  contentLength: number | null;
}

// Extrait une valeur de champ Jira brute vers une forme affichable simple :
// primitives inchangées, tableaux mappés récursivement, objets réduits à
// .value/.displayName/.name (options de select, utilisateurs, etc.).
export function extractFieldValue(raw: unknown): unknown {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'string' || typeof raw === 'number' || typeof raw === 'boolean') return raw;
  if (Array.isArray(raw)) {
    const mapped = raw.map(extractFieldValue).filter((v) => v !== null);
    return mapped.length ? mapped : null;
  }
  if (typeof raw === 'object') {
    const obj = raw as Record<string, unknown>;
    if (obj.value !== undefined) return obj.value;
    if (obj.displayName !== undefined) return obj.displayName;
    if (obj.name !== undefined) return obj.name;
    return null;
  }
  return null;
}

// Ne garde que les champs réellement renseignés sur l'issue, avec leur nom
// lisible résolu via le catalogue /rest/api/2/field (couvre aussi bien les
// champs standard que les customfield_*).
export function extractPopulatedFields(
  rawFields: Record<string, unknown>,
  fieldsMeta: Map<string, string>,
): JiraField[] {
  const result: JiraField[] = [];
  for (const [id, raw] of Object.entries(rawFields)) {
    const value = extractFieldValue(raw);
    if (value === null || value === undefined || value === '') continue;
    result.push({ id, name: fieldsMeta.get(id) ?? id, value });
  }
  result.sort((a, b) => a.name.localeCompare(b.name));
  return result;
}

function mapAttachments(raw: unknown): JiraAttachmentMeta[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((a) => ({
    id: String(a.id),
    filename: String(a.filename),
    mimeType: String(a.mimeType ?? 'application/octet-stream'),
    size: Number(a.size ?? 0),
    contentUrl: String(a.content),
  }));
}

export class JiraClient {
  constructor(
    private readonly config: JiraConfig,
    private readonly options: JiraClientOptions = {},
  ) {}

  private dispatcher(): Dispatcher {
    if (this.options.dispatcher) return this.options.dispatcher;
    return new Agent({
      connect: {
        rejectUnauthorized: this.config.tlsRejectUnauthorized ?? true,
        ca: this.config.caCert,
      },
    });
  }

  private authHeaders(): Record<string, string> {
    return { Authorization: `Bearer ${this.config.pat}` };
  }

  private async request(
    path: string,
    init: { method?: string; body?: string; headers?: Record<string, string> } = {},
  ): Promise<unknown> {
    const url = `${this.config.baseUrl.replace(/\/$/, '')}${path}`;
    const res = await undiciFetch(url, {
      method: init.method,
      body: init.body,
      dispatcher: this.dispatcher(),
      headers: {
        ...this.authHeaders(),
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...init.headers,
      },
    });
    if (!res.ok) {
      const text = await res.text();
      throw new JiraApiError(res.status, text.slice(0, 500));
    }
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  }

  async testConnection(): Promise<{ version: string }> {
    const data = (await this.request('/rest/api/2/serverInfo')) as { version: string };
    return { version: data.version };
  }

  // Map customfield_id/standard field id -> nom lisible.
  async getFieldsMeta(): Promise<Map<string, string>> {
    const data = (await this.request('/rest/api/2/field')) as Array<{ id: string; name: string }>;
    return new Map(data.map((f) => [f.id, f.name]));
  }

  async searchIssues(jql: string, maxResults = 50): Promise<JiraIssueSummary[]> {
    const fields = 'summary,status,issuetype';
    const query = new URLSearchParams({ jql, maxResults: String(maxResults), fields });
    const data = (await this.request(`/rest/api/2/search?${query.toString()}`)) as {
      issues: Array<{ key: string; fields: Record<string, unknown> }>;
    };
    return data.issues.map((issue) => ({
      key: issue.key,
      summary: String(issue.fields.summary ?? ''),
      status: extractFieldValue(issue.fields.status) as string | null,
      issueType: extractFieldValue(issue.fields.issuetype) as string | null,
    }));
  }

  async getIssue(key: string, fieldsMeta: Map<string, string>): Promise<JiraIssueDetail> {
    const data = (await this.request(`/rest/api/2/issue/${key}?fields=*all`)) as {
      key: string;
      fields: Record<string, unknown>;
    };
    const rawFields = data.fields;
    return {
      key: data.key,
      summary: String(rawFields.summary ?? ''),
      status: extractFieldValue(rawFields.status) as string | null,
      issueType: extractFieldValue(rawFields.issuetype) as string | null,
      fields: extractPopulatedFields(rawFields, fieldsMeta),
      attachments: mapAttachments(rawFields.attachment),
    };
  }

  // Récupère uniquement les métadonnées des pièces jointes d'une issue,
  // sans charger tous les champs (utilisé pour retrouver l'URL de contenu
  // avant de streamer un téléchargement).
  async getAttachments(key: string): Promise<JiraAttachmentMeta[]> {
    const data = (await this.request(`/rest/api/2/issue/${key}?fields=attachment`)) as {
      fields: { attachment?: unknown };
    };
    return mapAttachments(data.fields.attachment);
  }

  async getAttachmentStream(contentUrl: string): Promise<JiraAttachmentStream> {
    const res = await undiciFetch(contentUrl, {
      dispatcher: this.dispatcher(),
      headers: this.authHeaders(),
    });
    if (!res.ok || !res.body) {
      throw new JiraApiError(res.status, 'Attachment fetch failed');
    }
    return {
      body: res.body,
      contentType: res.headers.get('content-type'),
      contentLength: res.headers.get('content-length') ? Number(res.headers.get('content-length')) : null,
    };
  }
}
