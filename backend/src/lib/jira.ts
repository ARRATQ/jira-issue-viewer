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
  authorId: string | null;
  authorName: string | null;
}

export interface JiraIssueBase {
  key: string;
  summary: string;
  status: string | null;
  issueType: string | null;
}

// Vue liste : champs métier supplémentaires affichés en colonnes, définis
// par requête (SavedQuery.listColumns) — clé = nom de champ Jira demandé.
export interface JiraIssueSummary extends JiraIssueBase {
  extraFields: Record<string, string | null>;
}

// Vue détail : tous les champs renseignés (dont Profil/Offre Export s'ils
// existent) sont déjà dans `fields`, pas besoin de les dupliquer à part.
// reporterId/reporterName permettent au frontend de filtrer les pièces
// jointes par déposant (ex. n'afficher que celles du rapporteur).
export interface JiraIssueDetail extends JiraIssueBase {
  fields: JiraField[];
  attachments: JiraAttachmentMeta[];
  reporterId: string | null;
  reporterName: string | null;
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

function normalizeFieldName(name: string): string {
  return name
    .trim()
    .replace(/\s*:\s*$/, '')
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

// Résout l'id d'un champ (customfield_xxxxx ou champ standard) à partir de
// son nom lisible, tel que renvoyé par /rest/api/2/field — nécessaire pour
// demander des customfields à la recherche JQL, qui ne les accepte que par id.
function findFieldIdByName(fieldsMeta: Map<string, string>, wantedName: string): string | null {
  const normalizedWanted = normalizeFieldName(wantedName);
  for (const [id, name] of fieldsMeta) {
    if (normalizeFieldName(name) === normalizedWanted) return id;
  }
  return null;
}

// Ramène toujours une chaîne simple (ou null) : un champ Jira peut être
// multi-valeurs (liste à sélection multiple), auquel cas extractFieldValue
// renvoie un tableau — inacceptable pour les champs de la liste (colonnes,
// tri des filtres), donc on l'aplatit en une chaîne jointe par virgules.
function extractScalarFieldValue(raw: unknown): string | null {
  const value = extractFieldValue(raw);
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) return value.length ? value.map(String).join(', ') : null;
  return String(value);
}

// Identifie un utilisateur Jira de façon stable pour comparer "auteur d'une
// pièce jointe" et "rapporteur du ticket" : accountId (Cloud), key ou name
// (Data Center) selon ce que l'instance expose, plus un nom lisible pour
// l'affichage. Deux displayName peuvent se recouper, jamais ces identifiants.
function extractUserIdentity(raw: unknown): { id: string | null; displayName: string | null } {
  if (!raw || typeof raw !== 'object') return { id: null, displayName: null };
  const obj = raw as Record<string, unknown>;
  const idSource = obj.accountId ?? obj.key ?? obj.name ?? null;
  const id = idSource !== null && idSource !== undefined ? String(idSource) : null;
  const displayName = typeof obj.displayName === 'string' ? obj.displayName : null;
  return { id, displayName };
}

const SEARCH_PAGE_SIZE = 100;
// Garde-fou : évite de boucler indéfiniment sur un JQL retournant un très
// grand nombre de résultats.
const SEARCH_MAX_ISSUES = 500;

function mapAttachments(raw: unknown): JiraAttachmentMeta[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((a) => {
    const author = extractUserIdentity(a.author);
    return {
      id: String(a.id),
      filename: String(a.filename),
      mimeType: String(a.mimeType ?? 'application/octet-stream'),
      size: Number(a.size ?? 0),
      contentUrl: String(a.content),
      authorId: author.id,
      authorName: author.displayName,
    };
  });
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

  // Récupère TOUTES les issues correspondant au JQL (pagine automatiquement
  // au-delà de la limite par page de l'API Jira, jusqu'à SEARCH_MAX_ISSUES),
  // avec les champs standard plus les champs métier de `extraFieldNames`
  // (colonnes de liste configurées pour la requête sauvegardée courante).
  async searchIssues(jql: string, extraFieldNames: string[] = []): Promise<JiraIssueSummary[]> {
    const fieldsMeta = extraFieldNames.length > 0 ? await this.getFieldsMeta() : new Map<string, string>();
    const resolvedExtraFields = extraFieldNames.map((name) => ({
      name,
      id: findFieldIdByName(fieldsMeta, name),
    }));
    const extraIds = resolvedExtraFields.filter((f): f is { name: string; id: string } => f.id !== null).map((f) => f.id);
    const fields = ['summary', 'status', 'issuetype', ...extraIds].join(',');

    const issues: JiraIssueSummary[] = [];
    let startAt = 0;

    for (;;) {
      const query = new URLSearchParams({
        jql,
        startAt: String(startAt),
        maxResults: String(SEARCH_PAGE_SIZE),
        fields,
      });
      const data = (await this.request(`/rest/api/2/search?${query.toString()}`)) as {
        issues: Array<{ key: string; fields: Record<string, unknown> }>;
        total: number;
      };

      for (const issue of data.issues) {
        const extraFields: Record<string, string | null> = {};
        for (const f of resolvedExtraFields) {
          extraFields[f.name] = f.id ? extractScalarFieldValue(issue.fields[f.id]) : null;
        }
        issues.push({
          key: issue.key,
          summary: String(issue.fields.summary ?? ''),
          status: extractScalarFieldValue(issue.fields.status),
          issueType: extractScalarFieldValue(issue.fields.issuetype),
          extraFields,
        });
      }

      startAt += SEARCH_PAGE_SIZE;
      if (data.issues.length === 0 || issues.length >= data.total || issues.length >= SEARCH_MAX_ISSUES) break;
    }

    return issues;
  }

  async getIssue(key: string, fieldsMeta: Map<string, string>): Promise<JiraIssueDetail> {
    const data = (await this.request(`/rest/api/2/issue/${key}?fields=*all`)) as {
      key: string;
      fields: Record<string, unknown>;
    };
    const rawFields = data.fields;
    const reporter = extractUserIdentity(rawFields.reporter);
    return {
      key: data.key,
      summary: String(rawFields.summary ?? ''),
      status: extractScalarFieldValue(rawFields.status),
      issueType: extractScalarFieldValue(rawFields.issuetype),
      fields: extractPopulatedFields(rawFields, fieldsMeta),
      attachments: mapAttachments(rawFields.attachment),
      reporterId: reporter.id,
      reporterName: reporter.displayName,
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
