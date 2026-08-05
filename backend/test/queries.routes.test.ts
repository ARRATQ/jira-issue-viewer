import { describe, expect, it, beforeAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { Readable } from 'node:stream';
import { createFakePrisma } from './helpers/fakePrisma';

const fakePrisma = createFakePrisma();
vi.mock('../src/lib/prisma', () => ({ prisma: fakePrisma }));

const fakeJiraClient = {
  searchIssues: vi.fn(),
  getIssue: vi.fn(),
  getFieldsMeta: vi.fn(),
  getAttachments: vi.fn(),
  getAttachmentStream: vi.fn(),
};

vi.mock('../src/lib/jira', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/lib/jira')>();
  return {
    ...actual,
    JiraClient: vi.fn().mockImplementation(() => fakeJiraClient),
  };
});

beforeAll(() => {
  process.env.JWT_SECRET = 'test-secret';
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
  process.env.JIRA_URL = 'https://jira.example.com';
  process.env.JIRA_PAT = 'test-pat';
});

beforeEach(() => {
  fakePrisma.reset();
  vi.clearAllMocks();
});

const { createApp } = await import('../src/app');
const { signAccessToken } = await import('../src/lib/tokens');
const { createQuery } = await import('../src/services/savedQueries');

function tokenFor(role: 'ADMIN' | 'USER', sub = 'user-1') {
  return signAccessToken({ sub, email: `${sub}@example.com`, role });
}

describe('GET /api/queries', () => {
  it('returns 401 without a token', async () => {
    const res = await request(createApp()).get('/api/queries');
    expect(res.status).toBe(401);
  });

  it('lists saved queries ordered by position, accessible to USER', async () => {
    await createQuery({ name: 'Second', jql: 'project = B', position: 1 });
    await createQuery({ name: 'First', jql: 'project = A', position: 0 });

    const res = await request(createApp())
      .get('/api/queries')
      .set('Authorization', `Bearer ${tokenFor('USER')}`);

    expect(res.status).toBe(200);
    expect(res.body.queries.map((q: { name: string }) => q.name)).toEqual(['First', 'Second']);
  });
});

describe('GET /api/queries/:queryId/issues', () => {
  it('returns 404 for an unknown queryId', async () => {
    const res = await request(createApp())
      .get('/api/queries/does-not-exist/issues')
      .set('Authorization', `Bearer ${tokenFor('USER')}`);
    expect(res.status).toBe(404);
  });

  it("returns 400 when the query's JQL is empty", async () => {
    const query = await createQuery({ name: 'Empty', jql: '' });
    const res = await request(createApp())
      .get(`/api/queries/${query.id}/issues`)
      .set('Authorization', `Bearer ${tokenFor('USER')}`);
    expect(res.status).toBe(400);
  });

  it('returns the issue list (with configured list columns resolved) and logs VIEW_LIST', async () => {
    const query = await createQuery({
      name: 'Export',
      jql: 'project = PROJ',
      listColumns: [{ fieldName: 'Profil Export' }, { fieldName: 'Offre Export' }],
      tabs: [{ id: 'infos', label: 'Infos', position: 0, visibleToUser: true, fields: [{ fieldName: 'Raison Sociale' }] }],
      autresVisibleToUser: false,
    });
    fakeJiraClient.searchIssues.mockResolvedValue([
      {
        key: 'PROJ-1',
        summary: 'Ticket un',
        status: 'Open',
        issueType: 'Task',
        extraFields: { 'Profil Export': 'Débutant', 'Offre Export': 'Premium' },
      },
    ]);

    const res = await request(createApp())
      .get(`/api/queries/${query.id}/issues`)
      .set('Authorization', `Bearer ${tokenFor('USER')}`);

    expect(res.status).toBe(200);
    expect(res.body.queryId).toBe(query.id);
    expect(res.body.jql).toBe('project = PROJ');
    expect(res.body.autresVisibleToUser).toBe(false);
    expect(res.body.tabs).toEqual([
      { id: 'infos', label: 'Infos', position: 0, visibleToUser: true, fields: [{ fieldName: 'Raison Sociale' }] },
    ]);
    expect(res.body.issues).toEqual([
      {
        key: 'PROJ-1',
        summary: 'Ticket un',
        status: 'Open',
        issueType: 'Task',
        extraFields: { 'Profil Export': 'Débutant', 'Offre Export': 'Premium' },
      },
    ]);
    expect(fakeJiraClient.searchIssues).toHaveBeenCalledWith('project = PROJ', ['Profil Export', 'Offre Export']);

    const logs = fakePrisma.__state.auditLogs;
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      userId: 'user-1',
      action: 'VIEW_LIST',
      entityType: 'saved_query',
      entityKey: query.id,
    });
  });
});

describe('GET /api/queries/:queryId/issues/:key', () => {
  it('returns 404 for an unknown queryId', async () => {
    const res = await request(createApp())
      .get('/api/queries/does-not-exist/issues/PROJ-1')
      .set('Authorization', `Bearer ${tokenFor('USER')}`);
    expect(res.status).toBe(404);
  });

  it('returns the issue detail and logs VIEW_ISSUE with the queryId in details', async () => {
    const query = await createQuery({ name: 'Export', jql: 'project = PROJ' });
    fakeJiraClient.getFieldsMeta.mockResolvedValue(new Map());
    fakeJiraClient.getIssue.mockResolvedValue({
      key: 'PROJ-1',
      summary: 'Ticket un',
      status: 'Open',
      issueType: 'Task',
      fields: [],
      attachments: [],
      reporterId: null,
      reporterName: null,
    });

    const res = await request(createApp())
      .get(`/api/queries/${query.id}/issues/PROJ-1`)
      .set('Authorization', `Bearer ${tokenFor('USER')}`);

    expect(res.status).toBe(200);
    expect(res.body.key).toBe('PROJ-1');

    const logs = fakePrisma.__state.auditLogs;
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ action: 'VIEW_ISSUE', entityKey: 'PROJ-1', details: { queryId: query.id } });
  });
});

describe('GET /api/queries/:queryId/issues/:key/attachments/:id', () => {
  it('streams the attachment content and logs DOWNLOAD_ATTACHMENT', async () => {
    const query = await createQuery({ name: 'Export', jql: 'project = PROJ' });
    fakeJiraClient.getAttachments.mockResolvedValue([
      { id: '1001', filename: 'doc.pdf', mimeType: 'application/pdf', size: 3, contentUrl: 'https://jira.example.com/x' },
    ]);
    fakeJiraClient.getAttachmentStream.mockResolvedValue({
      body: Readable.toWeb(Readable.from([Buffer.from('abc')])),
      contentType: 'application/pdf',
      contentLength: 3,
    });

    const res = await request(createApp())
      .get(`/api/queries/${query.id}/issues/PROJ-1/attachments/1001`)
      .set('Authorization', `Bearer ${tokenFor('USER')}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/pdf');
    expect(Buffer.from(res.body as Buffer).toString('utf8')).toBe('abc');

    const logs = fakePrisma.__state.auditLogs;
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ action: 'DOWNLOAD_ATTACHMENT', entityKey: '1001', details: { queryId: query.id } });
  });

  it('returns 404 when the attachment id does not exist on the issue', async () => {
    const query = await createQuery({ name: 'Export', jql: 'project = PROJ' });
    fakeJiraClient.getAttachments.mockResolvedValue([]);

    const res = await request(createApp())
      .get(`/api/queries/${query.id}/issues/PROJ-1/attachments/unknown`)
      .set('Authorization', `Bearer ${tokenFor('USER')}`);

    expect(res.status).toBe(404);
  });

  it('returns 404 for an unknown queryId before even reaching Jira', async () => {
    const res = await request(createApp())
      .get('/api/queries/does-not-exist/issues/PROJ-1/attachments/1001')
      .set('Authorization', `Bearer ${tokenFor('USER')}`);
    expect(res.status).toBe(404);
    expect(fakeJiraClient.getAttachments).not.toHaveBeenCalled();
  });
});
