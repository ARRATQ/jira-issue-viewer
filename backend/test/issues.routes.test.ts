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
  process.env.JIRA_JQL = 'project = PROJ';
});

beforeEach(() => {
  fakePrisma.reset();
  vi.clearAllMocks();
});

const { createApp } = await import('../src/app');
const { signAccessToken } = await import('../src/lib/tokens');

function tokenFor(role: 'ADMIN' | 'USER', sub = 'user-1') {
  return signAccessToken({ sub, email: `${sub}@example.com`, role });
}

describe('GET /api/issues', () => {
  it('returns 401 without a token', async () => {
    const res = await request(createApp()).get('/api/issues');
    expect(res.status).toBe(401);
  });

  it('returns the issue list and logs VIEW_LIST', async () => {
    fakeJiraClient.searchIssues.mockResolvedValue([
      {
        key: 'PROJ-1',
        summary: 'Ticket un',
        status: 'Open',
        issueType: 'Task',
        profilExport: 'Débutant',
        offreExport: 'Premium',
      },
    ]);

    const res = await request(createApp())
      .get('/api/issues')
      .set('Authorization', `Bearer ${tokenFor('USER')}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      jql: 'project = PROJ',
      issues: [
        {
          key: 'PROJ-1',
          summary: 'Ticket un',
          status: 'Open',
          issueType: 'Task',
          profilExport: 'Débutant',
          offreExport: 'Premium',
        },
      ],
    });

    const logs = fakePrisma.__state.auditLogs;
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ userId: 'user-1', action: 'VIEW_LIST', details: { jql: 'project = PROJ' } });
  });
});

describe('GET /api/issues/:key', () => {
  it('returns the issue detail and logs VIEW_ISSUE', async () => {
    fakeJiraClient.getFieldsMeta.mockResolvedValue(new Map());
    fakeJiraClient.getIssue.mockResolvedValue({
      key: 'PROJ-1',
      summary: 'Ticket un',
      status: 'Open',
      issueType: 'Task',
      fields: [],
      attachments: [],
    });

    const res = await request(createApp())
      .get('/api/issues/PROJ-1')
      .set('Authorization', `Bearer ${tokenFor('USER')}`);

    expect(res.status).toBe(200);
    expect(res.body.key).toBe('PROJ-1');

    const logs = fakePrisma.__state.auditLogs;
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ action: 'VIEW_ISSUE', entityKey: 'PROJ-1' });
  });
});

describe('GET /api/issues/:key/attachments/:id', () => {
  it('streams the attachment content and logs DOWNLOAD_ATTACHMENT', async () => {
    fakeJiraClient.getAttachments.mockResolvedValue([
      { id: '1001', filename: 'doc.pdf', mimeType: 'application/pdf', size: 3, contentUrl: 'https://jira.example.com/x' },
    ]);
    fakeJiraClient.getAttachmentStream.mockResolvedValue({
      body: Readable.toWeb(Readable.from([Buffer.from('abc')])),
      contentType: 'application/pdf',
      contentLength: 3,
    });

    const res = await request(createApp())
      .get('/api/issues/PROJ-1/attachments/1001')
      .set('Authorization', `Bearer ${tokenFor('USER')}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/pdf');
    expect(Buffer.from(res.body as Buffer).toString('utf8')).toBe('abc');

    const logs = fakePrisma.__state.auditLogs;
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ action: 'DOWNLOAD_ATTACHMENT', entityKey: '1001' });
  });

  it('returns 404 when the attachment id does not exist on the issue', async () => {
    fakeJiraClient.getAttachments.mockResolvedValue([]);

    const res = await request(createApp())
      .get('/api/issues/PROJ-1/attachments/unknown')
      .set('Authorization', `Bearer ${tokenFor('USER')}`);

    expect(res.status).toBe(404);
  });
});
