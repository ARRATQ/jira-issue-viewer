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

  it('searchIssues returns mapped issue summaries', async () => {
    const pool = mockAgent.get(ORIGIN);
    pool
      .intercept({ path: /\/jira\/rest\/api\/2\/search.*/, method: 'GET' })
      .reply(200, {
        issues: [
          { key: 'PROJ-1', fields: { summary: 'Ticket un', status: { name: 'Open' }, issuetype: { name: 'Task' } } },
          { key: 'PROJ-2', fields: { summary: 'Ticket deux', status: { name: 'Done' }, issuetype: { name: 'Bug' } } },
        ],
      });

    const issues = await client().searchIssues('project = PROJ');

    expect(issues).toEqual([
      { key: 'PROJ-1', summary: 'Ticket un', status: 'Open', issueType: 'Task' },
      { key: 'PROJ-2', summary: 'Ticket deux', status: 'Done', issueType: 'Bug' },
    ]);
  });

  it('sends the PAT as a Bearer Authorization header', async () => {
    const pool = mockAgent.get(ORIGIN);
    pool
      .intercept({
        path: /\/jira\/rest\/api\/2\/search.*/,
        method: 'GET',
        headers: (headers) => headers.authorization === 'Bearer test-pat',
      })
      .reply(200, { issues: [] });

    // Si le header Authorization ne correspond pas, undici lève une erreur
    // "no matching interceptor" — c'est l'assertion elle-même.
    await expect(client().searchIssues('project = PROJ')).resolves.toEqual([]);
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
      },
    ]);
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
