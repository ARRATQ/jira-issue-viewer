import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { MockAgent } from 'undici';
import { JiraApiError, JiraClient } from '../src/lib/jira';
import fieldCatalog from './fixtures/jira-field-catalog.json';
import issueDetail from './fixtures/jira-issue-detail.json';

const ORIGIN = 'https://jira.internal.example.com';
const BASE_URL = `${ORIGIN}/jira`;

describe('JiraClient (mocked HTTP via undici MockAgent)', () => {
  let mockAgent: MockAgent;

  beforeEach(() => {
    mockAgent = new MockAgent();
    mockAgent.disableNetConnect();
  });

  afterEach(async () => {
    await mockAgent.close();
  });

  function client() {
    return new JiraClient(
      { baseUrl: BASE_URL, pat: 'test-pat' },
      { dispatcher: mockAgent },
    );
  }

  it('searchIssues returns mapped issue summaries with an empty extraFields map when none requested', async () => {
    const pool = mockAgent.get(ORIGIN);
    pool
      .intercept({ path: /\/jira\/rest\/api\/2\/search.*/, method: 'GET' })
      .reply(200, {
        total: 2,
        issues: [
          { key: 'PROJ-1', fields: { summary: 'Ticket un', status: { name: 'Open' }, issuetype: { name: 'Task' } } },
          { key: 'PROJ-2', fields: { summary: 'Ticket deux', status: { name: 'Done' }, issuetype: { name: 'Bug' } } },
        ],
      });

    const { issues } = await client().searchIssues('project = PROJ');

    expect(issues).toEqual([
      { key: 'PROJ-1', summary: 'Ticket un', status: 'Open', issueType: 'Task', extraFields: {} },
      { key: 'PROJ-2', summary: 'Ticket deux', status: 'Done', issueType: 'Bug', extraFields: {} },
    ]);
  });

  it('resolves requested extra field names into the extraFields map', async () => {
    const pool = mockAgent.get(ORIGIN);
    pool.intercept({ path: '/jira/rest/api/2/field', method: 'GET' }).reply(200, fieldCatalog);
    pool
      .intercept({ path: /\/jira\/rest\/api\/2\/search.*/, method: 'GET' })
      .reply(200, {
        total: 1,
        issues: [
          {
            key: 'PROJ-1',
            fields: {
              summary: 'Ticket un',
              status: { name: 'Open' },
              issuetype: { name: 'Task' },
              customfield_10020: { value: 'Débutant' },
              customfield_10021: { value: 'Premium' },
            },
          },
        ],
      });

    const { issues } = await client().searchIssues('project = PROJ', ['Profil Export', 'Offre Export']);

    expect(issues).toEqual([
      {
        key: 'PROJ-1',
        summary: 'Ticket un',
        status: 'Open',
        issueType: 'Task',
        extraFields: { 'Profil Export': 'Débutant', 'Offre Export': 'Premium' },
      },
    ]);
  });

  it('resolves to null an extra field name absent from the catalog, without failing', async () => {
    const pool = mockAgent.get(ORIGIN);
    pool.intercept({ path: '/jira/rest/api/2/field', method: 'GET' }).reply(200, fieldCatalog);
    pool
      .intercept({ path: /\/jira\/rest\/api\/2\/search.*/, method: 'GET' })
      .reply(200, {
        total: 1,
        issues: [{ key: 'PROJ-1', fields: { summary: 'Ticket un', status: null, issuetype: null } }],
      });

    const { issues } = await client().searchIssues('project = PROJ', ['Champ Inexistant']);

    expect(issues[0]?.extraFields).toEqual({ 'Champ Inexistant': null });
  });

  it('flattens a multi-select extra field into a joined string', async () => {
    const pool = mockAgent.get(ORIGIN);
    pool.intercept({ path: '/jira/rest/api/2/field', method: 'GET' }).reply(200, fieldCatalog);
    pool
      .intercept({ path: /\/jira\/rest\/api\/2\/search.*/, method: 'GET' })
      .reply(200, {
        total: 1,
        issues: [
          {
            key: 'PROJ-1',
            fields: {
              summary: 'Ticket un',
              status: { name: 'Open' },
              issuetype: { name: 'Task' },
              // Champ à sélection multiple : extractFieldValue renvoie un tableau.
              customfield_10020: [{ value: 'Débutant' }, { value: 'Confirmé' }],
              customfield_10021: null,
            },
          },
        ],
      });

    const { issues } = await client().searchIssues('project = PROJ', ['Profil Export', 'Offre Export']);

    expect(issues[0]?.extraFields['Profil Export']).toBe('Débutant, Confirmé');
    expect(issues[0]?.extraFields['Offre Export']).toBeNull();
  });

  // Jira peut plafonner la taille de page sous la valeur demandée (ici 1) :
  // on avance alors du maxResults annoncé pour ne sauter aucune issue.
  // Jira Data Center contient souvent plusieurs champs personnalisés de même
  // nom (ex. un « Raison Sociale » par projet). La fiche affiche celui qui est
  // renseigné ; la liste doit faire de même au lieu de prendre le 1er id trouvé.
  it('reads every field sharing the requested name and keeps the populated one', async () => {
    const pool = mockAgent.get(ORIGIN);
    pool.intercept({ path: '/jira/rest/api/2/field', method: 'GET' }).reply(200, [
      { id: 'customfield_20001', name: 'Raison Sociale' },
      { id: 'customfield_20002', name: 'Raison sociale ' },
      { id: 'customfield_20003', name: 'ICE' },
      { id: 'customfield_20004', name: 'ICE' },
    ]);
    pool
      .intercept({
        path: (path) =>
          path.startsWith('/jira/rest/api/2/search?') &&
          ['customfield_20001', 'customfield_20002', 'customfield_20003', 'customfield_20004'].every((id) =>
            decodeURIComponent(path).includes(id),
          ),
        method: 'GET',
      })
      .reply(200, {
        total: 1,
        issues: [
          {
            key: 'PROJ-1',
            fields: {
              summary: 'Dossier',
              status: null,
              issuetype: null,
              customfield_20001: '',
              customfield_20002: 'Acme SARL',
              customfield_20003: '001234567000089',
              customfield_20004: null,
            },
          },
        ],
      });

    const { issues } = await client().searchIssues('project = PROJ', ['Raison Sociale', 'ICE']);

    expect(issues[0]?.extraFields).toEqual({ 'Raison Sociale': 'Acme SARL', ICE: '001234567000089' });
  });

  it('paginates until every issue is fetched, using the page size Jira actually applied', async () => {
    const pool = mockAgent.get(ORIGIN);
    pool
      .intercept({ path: /\/jira\/rest\/api\/2\/search\?.*startAt=0$/, method: 'GET' })
      .reply(200, {
        total: 2,
        maxResults: 1,
        issues: [{ key: 'PROJ-1', fields: { summary: 'Un', status: null, issuetype: null } }],
      });
    pool
      .intercept({ path: /\/jira\/rest\/api\/2\/search\?.*startAt=1$/, method: 'GET' })
      .reply(200, {
        total: 2,
        issues: [{ key: 'PROJ-2', fields: { summary: 'Deux', status: null, issuetype: null } }],
      });

    const { issues } = await client().searchIssues('project = PROJ');

    expect(issues.map((i) => i.key)).toEqual(['PROJ-1', 'PROJ-2']);
  });

  // Jira renvoie 100 issues par page, numérotées d'après startAt, pour un
  // total supérieur au plafond : on doit s'arrêter à 3000, dans l'ordre.
  it('fetches remaining pages in parallel, keeps their order and stops at the 3000 cap', async () => {
    const requestedStarts: number[] = [];
    mockAgent
      .get(ORIGIN)
      .intercept({ path: /\/jira\/rest\/api\/2\/search\?.*/, method: 'GET' })
      .reply(200, (opts) => {
        const startAt = Number(new URL(String(opts.path), ORIGIN).searchParams.get('startAt'));
        requestedStarts.push(startAt);
        return {
          total: 5000,
          issues: Array.from({ length: 100 }, (_, i) => ({
            key: `PROJ-${startAt + i + 1}`,
            fields: { summary: 'x', status: null, issuetype: null },
          })),
        };
      })
      .persist();

    const { issues, total } = await client().searchIssues('project = PROJ');

    expect(total).toBe(5000);
    expect(issues).toHaveLength(3000);
    expect(issues[0]?.key).toBe('PROJ-1');
    expect(issues[2999]?.key).toBe('PROJ-3000');
    expect(issues.map((i) => i.key)).toEqual(Array.from({ length: 3000 }, (_, i) => `PROJ-${i + 1}`));
    expect(Math.max(...requestedStarts)).toBe(2900);
    expect(requestedStarts).toHaveLength(30);
  });

  it('sends the PAT as a Bearer Authorization header', async () => {
    const pool = mockAgent.get(ORIGIN);
    pool
      .intercept({
        path: /\/jira\/rest\/api\/2\/search.*/,
        method: 'GET',
        headers: (headers) => headers.authorization === 'Bearer test-pat',
      })
      .reply(200, { total: 0, issues: [] });

    // Si le header Authorization ne correspond pas, undici lève une erreur
    // "no matching interceptor" — c'est l'assertion elle-même.
    await expect(client().searchIssues('project = PROJ')).resolves.toEqual({ issues: [], total: 0 });
  });

  it('getFieldsMeta builds an id -> name map from the field catalog', async () => {
    const pool = mockAgent.get(ORIGIN);
    pool.intercept({ path: '/jira/rest/api/2/field', method: 'GET' }).reply(200, fieldCatalog);

    const meta = await client().getFieldsMeta();

    expect(meta.get('customfield_10010')).toBe('Solution Référencée');
    expect(meta.get('summary')).toBe('Summary');
  });

  it('getIssue returns only populated fields with readable names, plus attachments', async () => {
    const pool = mockAgent.get(ORIGIN);
    pool
      .intercept({ path: '/jira/rest/api/2/issue/PROJ-123?fields=*all', method: 'GET' })
      .reply(200, issueDetail);

    const fieldsMeta = new Map(fieldCatalog.map((f) => [f.id, f.name]));
    const issue = await client().getIssue('PROJ-123', fieldsMeta);

    expect(issue.key).toBe('PROJ-123');
    expect(issue.status).toBe('In Progress');
    expect(issue.fields.some((f) => f.id === 'customfield_10011')).toBe(false);
    expect(issue.attachments).toEqual([
      {
        id: '1001',
        filename: 'cahier-des-charges.pdf',
        mimeType: 'application/pdf',
        size: 204800,
        contentUrl: 'https://jira.example.com/secure/attachment/1001/cahier-des-charges.pdf',
        authorId: 'jdupont',
        authorName: 'Jean Dupont',
      },
      {
        id: '1002',
        filename: 'note-interne.docx',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        size: 51200,
        contentUrl: 'https://jira.example.com/secure/attachment/1002/note-interne.docx',
        authorId: 'agent42',
        authorName: 'Agent Support',
      },
    ]);
  });

  it('resolves the reporter identity so attachments can be matched against it', async () => {
    const pool = mockAgent.get(ORIGIN);
    pool
      .intercept({ path: '/jira/rest/api/2/issue/PROJ-123?fields=*all', method: 'GET' })
      .reply(200, issueDetail);

    const fieldsMeta = new Map(fieldCatalog.map((f) => [f.id, f.name]));
    const issue = await client().getIssue('PROJ-123', fieldsMeta);

    expect(issue.reporterId).toBe('jdupont');
    expect(issue.reporterName).toBe('Jean Dupont');

    const reporterAttachments = issue.attachments.filter((a) => a.authorId === issue.reporterId);
    expect(reporterAttachments.map((a) => a.filename)).toEqual(['cahier-des-charges.pdf']);
  });

  it('throws JiraApiError on a non-2xx response', async () => {
    const pool = mockAgent.get(ORIGIN);
    pool
      .intercept({ path: '/jira/rest/api/2/issue/PROJ-404?fields=*all', method: 'GET' })
      .reply(404, 'Issue Does Not Exist');

    const fieldsMeta = new Map<string, string>();
    await expect(client().getIssue('PROJ-404', fieldsMeta)).rejects.toBeInstanceOf(JiraApiError);
  });
});
