import { describe, expect, it, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { Readable } from 'node:stream';
import { createFakePrisma } from './helpers/fakePrisma';
import { readZip } from './helpers/readZip';
import { JiraApiError } from '../src/lib/jira';

const fakePrisma = createFakePrisma();
vi.mock('../src/lib/prisma', () => ({ prisma: fakePrisma }));

const fakeJiraClient = {
  getFieldsMeta: vi.fn(),
  searchIssues: vi.fn(),
  getAttachmentsWithReporter: vi.fn(),
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
  process.env.ENCRYPTION_KEY = 'c'.repeat(64);
  process.env.JIRA_URL = 'https://jira.example.com';
  process.env.JIRA_PAT = 'test-pat';
});

beforeEach(() => {
  fakePrisma.reset();
  vi.clearAllMocks();
});

const { createApp } = await import('../src/app');
const { signAccessToken } = await import('../src/lib/tokens');
const { createQuery: createSavedQuery } = await import('../src/services/savedQueries');
const { clearExportJobs, jobCompletion } = await import('../src/services/exportJobs');

function tokenFor(role: 'ADMIN' | 'USER', sub = 'admin-1') {
  return signAccessToken({ sub, email: `${sub}@example.com`, role });
}

describe('role gating on /api/admin/*', () => {
  it.each([
    ['/api/admin/config', 'get'],
    ['/api/admin/users', 'get'],
    ['/api/admin/audit-logs', 'get'],
    ['/api/admin/queries', 'get'],
    ['/api/admin/jira-fields', 'get'],
  ] as const)('rejects USER role on %s (403)', async (path) => {
    const res = await request(createApp())
      .get(path)
      .set('Authorization', `Bearer ${tokenFor('USER', 'user-1')}`);
    expect(res.status).toBe(403);
  });

  it('rejects requests with no token (401)', async () => {
    const res = await request(createApp()).get('/api/admin/users');
    expect(res.status).toBe(401);
  });
});

describe('PUT /api/admin/config', () => {
  it('updates the URL, encrypts the PAT, never returns it, and logs UPDATE_CONFIG without the PAT value', async () => {
    const res = await request(createApp())
      .put('/api/admin/config')
      .set('Authorization', `Bearer ${tokenFor('ADMIN')}`)
      .send({ jiraUrl: 'https://jira.example.com', pat: 'super-secret-pat' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      jiraUrl: 'https://jira.example.com',
      tlsRejectUnauthorized: true,
      patConfigured: true,
    });

    const storedPat = fakePrisma.__state.configs.get('jira_pat');
    expect(storedPat?.encrypted).toBe(true);
    expect(storedPat?.value).not.toContain('super-secret-pat');

    const logs = fakePrisma.__state.auditLogs;
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ action: 'UPDATE_CONFIG' });
    expect(JSON.stringify(logs[0].details)).not.toContain('super-secret-pat');
  });
});

describe('users admin endpoints', () => {
  it('creates a user and logs CREATE_USER', async () => {
    const res = await request(createApp())
      .post('/api/admin/users')
      .set('Authorization', `Bearer ${tokenFor('ADMIN')}`)
      .send({ email: 'new@example.com', name: 'New User', password: 'P@ssw0rd123', role: 'USER' });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ email: 'new@example.com', role: 'USER', active: true, mustChangePassword: true });
    expect(res.body.passwordHash).toBeUndefined();

    const logs = fakePrisma.__state.auditLogs;
    expect(logs.find((l) => l.action === 'CREATE_USER')).toBeTruthy();
  });

  it('honours mustChangePassword=false when the admin unchecks it at creation', async () => {
    const res = await request(createApp())
      .post('/api/admin/users')
      .set('Authorization', `Bearer ${tokenFor('ADMIN')}`)
      .send({ email: 'nochange@example.com', name: 'No Change', password: 'P@ssw0rd123', mustChangePassword: false });

    expect(res.status).toBe(201);
    expect(res.body.mustChangePassword).toBe(false);
  });

  it('lets an admin require a password change without resetting the password', async () => {
    const created = await request(createApp())
      .post('/api/admin/users')
      .set('Authorization', `Bearer ${tokenFor('ADMIN')}`)
      .send({ email: 'rotate@example.com', name: 'Rotate', password: 'P@ssw0rd123', mustChangePassword: false });
    expect(created.body.mustChangePassword).toBe(false);

    const res = await request(createApp())
      .patch(`/api/admin/users/${created.body.id}`)
      .set('Authorization', `Bearer ${tokenFor('ADMIN')}`)
      .send({ mustChangePassword: true });

    expect(res.status).toBe(200);
    expect(res.body.mustChangePassword).toBe(true);
  });

  it('forces a password change after an admin resets the password', async () => {
    const created = await request(createApp())
      .post('/api/admin/users')
      .set('Authorization', `Bearer ${tokenFor('ADMIN')}`)
      .send({ email: 'reset2@example.com', name: 'Reset Two', password: 'P@ssw0rd123', mustChangePassword: false });
    expect(created.body.mustChangePassword).toBe(false);

    const res = await request(createApp())
      .patch(`/api/admin/users/${created.body.id}`)
      .set('Authorization', `Bearer ${tokenFor('ADMIN')}`)
      .send({ password: 'N3w!Temp0rary' });

    expect(res.status).toBe(200);
    expect(res.body.mustChangePassword).toBe(true);
  });

  it('rejects user creation with missing fields (400)', async () => {
    const res = await request(createApp())
      .post('/api/admin/users')
      .set('Authorization', `Bearer ${tokenFor('ADMIN')}`)
      .send({ email: 'incomplete@example.com' });
    expect(res.status).toBe(400);
  });

  it('rejects user creation with a password that does not meet the strength policy (400)', async () => {
    const res = await request(createApp())
      .post('/api/admin/users')
      .set('Authorization', `Bearer ${tokenFor('ADMIN')}`)
      .send({ email: 'weak@example.com', name: 'Weak', password: 'weak' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/mot de passe/i);
  });

  it('rejects an admin password reset that does not meet the strength policy (400)', async () => {
    const created = await request(createApp())
      .post('/api/admin/users')
      .set('Authorization', `Bearer ${tokenFor('ADMIN')}`)
      .send({ email: 'resetme@example.com', name: 'Reset Me', password: 'P@ssw0rd123' });

    const res = await request(createApp())
      .patch(`/api/admin/users/${created.body.id}`)
      .set('Authorization', `Bearer ${tokenFor('ADMIN')}`)
      .send({ password: 'weak' });

    expect(res.status).toBe(400);
  });

  it('logs DEACTIVATE_USER (not UPDATE_USER) when active is set to false', async () => {
    const created = await request(createApp())
      .post('/api/admin/users')
      .set('Authorization', `Bearer ${tokenFor('ADMIN')}`)
      .send({ email: 'todeactivate@example.com', name: 'To Deactivate', password: 'P@ssw0rd123' });

    const res = await request(createApp())
      .patch(`/api/admin/users/${created.body.id}`)
      .set('Authorization', `Bearer ${tokenFor('ADMIN')}`)
      .send({ active: false });

    expect(res.status).toBe(200);
    expect(res.body.active).toBe(false);

    const logs = fakePrisma.__state.auditLogs;
    expect(logs.find((l) => l.action === 'DEACTIVATE_USER')).toBeTruthy();
    expect(logs.find((l) => l.action === 'UPDATE_USER')).toBeUndefined();
  });

  it('logs UPDATE_USER for a non-deactivating change', async () => {
    const created = await request(createApp())
      .post('/api/admin/users')
      .set('Authorization', `Bearer ${tokenFor('ADMIN')}`)
      .send({ email: 'rename@example.com', name: 'Old Name', password: 'P@ssw0rd123' });

    const res = await request(createApp())
      .patch(`/api/admin/users/${created.body.id}`)
      .set('Authorization', `Bearer ${tokenFor('ADMIN')}`)
      .send({ name: 'New Name' });

    expect(res.status).toBe(200);
    expect(res.body.name).toBe('New Name');

    const logs = fakePrisma.__state.auditLogs;
    expect(logs.find((l) => l.action === 'UPDATE_USER')).toBeTruthy();
  });

  it('lets an admin edit the email and name of a user', async () => {
    const created = await request(createApp())
      .post('/api/admin/users')
      .set('Authorization', `Bearer ${tokenFor('ADMIN')}`)
      .send({ email: 'before@example.com', name: 'Before', password: 'P@ssw0rd123' });

    const res = await request(createApp())
      .patch(`/api/admin/users/${created.body.id}`)
      .set('Authorization', `Bearer ${tokenFor('ADMIN')}`)
      .send({ email: '  after@example.com ', name: '  After  ' });

    expect(res.status).toBe(200);
    expect(res.body.email).toBe('after@example.com');
    expect(res.body.name).toBe('After');
  });

  it('rejects an email already used by another account (409)', async () => {
    await request(createApp())
      .post('/api/admin/users')
      .set('Authorization', `Bearer ${tokenFor('ADMIN')}`)
      .send({ email: 'taken@example.com', name: 'Taken', password: 'P@ssw0rd123' });
    const other = await request(createApp())
      .post('/api/admin/users')
      .set('Authorization', `Bearer ${tokenFor('ADMIN')}`)
      .send({ email: 'other@example.com', name: 'Other', password: 'P@ssw0rd123' });

    const res = await request(createApp())
      .patch(`/api/admin/users/${other.body.id}`)
      .set('Authorization', `Bearer ${tokenFor('ADMIN')}`)
      .send({ email: 'taken@example.com' });

    expect(res.status).toBe(409);
  });

  it('accepts re-submitting the user own email unchanged', async () => {
    const created = await request(createApp())
      .post('/api/admin/users')
      .set('Authorization', `Bearer ${tokenFor('ADMIN')}`)
      .send({ email: 'same@example.com', name: 'Same', password: 'P@ssw0rd123' });

    const res = await request(createApp())
      .patch(`/api/admin/users/${created.body.id}`)
      .set('Authorization', `Bearer ${tokenFor('ADMIN')}`)
      .send({ email: 'same@example.com', name: 'Same Renamed' });

    expect(res.status).toBe(200);
  });

  it.each([
    [{ email: 'not-an-email' }],
    [{ email: '' }],
    [{ name: '   ' }],
  ])('rejects invalid profile data %j (400)', async (body) => {
    const created = await request(createApp())
      .post('/api/admin/users')
      .set('Authorization', `Bearer ${tokenFor('ADMIN')}`)
      .send({ email: 'invalid@example.com', name: 'Invalid', password: 'P@ssw0rd123' });

    const res = await request(createApp())
      .patch(`/api/admin/users/${created.body.id}`)
      .set('Authorization', `Bearer ${tokenFor('ADMIN')}`)
      .send(body);

    expect(res.status).toBe(400);
  });

  it('returns 404 when editing an unknown user', async () => {
    const res = await request(createApp())
      .patch('/api/admin/users/does-not-exist')
      .set('Authorization', `Bearer ${tokenFor('ADMIN')}`)
      .send({ name: 'Ghost' });
    expect(res.status).toBe(404);
  });

  it('logs RESET_PASSWORD without the password when an admin resets it', async () => {
    const created = await request(createApp())
      .post('/api/admin/users')
      .set('Authorization', `Bearer ${tokenFor('ADMIN')}`)
      .send({ email: 'auditreset@example.com', name: 'Audit Reset', password: 'P@ssw0rd123' });

    await request(createApp())
      .patch(`/api/admin/users/${created.body.id}`)
      .set('Authorization', `Bearer ${tokenFor('ADMIN')}`)
      .send({ password: 'N3w!Temp0rary' });

    const log = fakePrisma.__state.auditLogs.find((l) => l.action === 'RESET_PASSWORD');
    expect(log).toBeTruthy();
    expect(JSON.stringify(log)).not.toContain('N3w!Temp0rary');
  });

  it.each([[{ active: false }], [{ role: 'USER' }]])(
    'prevents an admin from locking themselves out with %j (400)',
    async (body) => {
      const self = await request(createApp())
        .post('/api/admin/users')
        .set('Authorization', `Bearer ${tokenFor('ADMIN')}`)
        .send({ email: 'self@example.com', name: 'Self', password: 'P@ssw0rd123', role: 'ADMIN' });

      const res = await request(createApp())
        .patch(`/api/admin/users/${self.body.id}`)
        .set('Authorization', `Bearer ${tokenFor('ADMIN', self.body.id)}`)
        .send(body);

      expect(res.status).toBe(400);
    },
  );
});

describe('GET /api/admin/audit-logs', () => {
  it('paginates and filters by action', async () => {
    await request(createApp())
      .post('/api/admin/users')
      .set('Authorization', `Bearer ${tokenFor('ADMIN')}`)
      .send({ email: 'a@example.com', name: 'A', password: 'P@ssw0rd123' });
    await request(createApp())
      .put('/api/admin/config')
      .set('Authorization', `Bearer ${tokenFor('ADMIN')}`)
      .send({ jiraUrl: 'https://jira.example.com' });

    const res = await request(createApp())
      .get('/api/admin/audit-logs?action=CREATE_USER')
      .set('Authorization', `Bearer ${tokenFor('ADMIN')}`);

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].action).toBe('CREATE_USER');
  });
});

const TINY_PNG_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

describe('PUT /api/admin/branding', () => {
  it('rejects USER role (403)', async () => {
    const res = await request(createApp())
      .put('/api/admin/branding')
      .set('Authorization', `Bearer ${tokenFor('USER', 'user-1')}`)
      .send({ appName: 'Hack' });
    expect(res.status).toBe(403);
  });

  it('updates the app name and logo, and logs UPDATE_CONFIG with entityType branding', async () => {
    const res = await request(createApp())
      .put('/api/admin/branding')
      .set('Authorization', `Bearer ${tokenFor('ADMIN')}`)
      .send({ appName: 'Maroc PME Portail', logoDataUrl: TINY_PNG_DATA_URL });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ appName: 'Maroc PME Portail', logoDataUrl: TINY_PNG_DATA_URL });

    const logs = fakePrisma.__state.auditLogs;
    expect(logs.find((l) => l.action === 'UPDATE_CONFIG' && l.entityType === 'branding')).toBeTruthy();
  });

  it('returns 400 for an invalid logo format without changing the stored branding', async () => {
    const res = await request(createApp())
      .put('/api/admin/branding')
      .set('Authorization', `Bearer ${tokenFor('ADMIN')}`)
      .send({ logoDataUrl: 'not-a-data-url' });

    expect(res.status).toBe(400);
    expect(fakePrisma.__state.configs.get('app_logo')).toBeUndefined();
  });
});

describe('/api/admin/queries CRUD', () => {
  it('creates a query and logs SAVE_QUERY', async () => {
    const res = await request(createApp())
      .post('/api/admin/queries')
      .set('Authorization', `Bearer ${tokenFor('ADMIN')}`)
      .send({ name: 'Export', jql: 'project = EXP' });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ name: 'Export', jql: 'project = EXP', tabs: [], listColumns: [] });

    const logs = fakePrisma.__state.auditLogs;
    expect(logs.find((l) => l.action === 'SAVE_QUERY' && l.entityKey === res.body.id)).toBeTruthy();
  });

  it('rejects creation with a missing name or JQL (400)', async () => {
    const missingName = await request(createApp())
      .post('/api/admin/queries')
      .set('Authorization', `Bearer ${tokenFor('ADMIN')}`)
      .send({ jql: 'project = EXP' });
    expect(missingName.status).toBe(400);

    const missingJql = await request(createApp())
      .post('/api/admin/queries')
      .set('Authorization', `Bearer ${tokenFor('ADMIN')}`)
      .send({ name: 'Export' });
    expect(missingJql.status).toBe(400);
  });

  it('lists queries', async () => {
    await request(createApp())
      .post('/api/admin/queries')
      .set('Authorization', `Bearer ${tokenFor('ADMIN')}`)
      .send({ name: 'Export', jql: 'project = EXP' });

    const res = await request(createApp())
      .get('/api/admin/queries')
      .set('Authorization', `Bearer ${tokenFor('ADMIN')}`);

    expect(res.status).toBe(200);
    expect(res.body.queries).toHaveLength(1);
    expect(res.body.queries[0]).toMatchObject({ name: 'Export' });
  });

  it('updates a query (tabs, listColumns, autresVisibleToUser) and logs SAVE_QUERY', async () => {
    const created = await request(createApp())
      .post('/api/admin/queries')
      .set('Authorization', `Bearer ${tokenFor('ADMIN')}`)
      .send({ name: 'Export', jql: 'project = EXP' });

    const res = await request(createApp())
      .put(`/api/admin/queries/${created.body.id}`)
      .set('Authorization', `Bearer ${tokenFor('ADMIN')}`)
      .send({
        name: 'Export renommé',
        listColumns: [{ fieldName: 'Profil Export' }],
        tabs: [{ id: 'infos', label: 'Infos', position: 0, visibleToUser: true, fields: [{ fieldName: 'GSM' }] }],
        autresVisibleToUser: true,
      });

    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Export renommé');
    expect(res.body.listColumns).toEqual([{ fieldName: 'Profil Export' }]);
    expect(res.body.autresVisibleToUser).toBe(true);

    const logs = fakePrisma.__state.auditLogs;
    expect(logs.find((l) => l.action === 'SAVE_QUERY' && l.entityKey === created.body.id)).toBeTruthy();
  });

  it('returns 404 when updating an unknown query', async () => {
    const res = await request(createApp())
      .put('/api/admin/queries/does-not-exist')
      .set('Authorization', `Bearer ${tokenFor('ADMIN')}`)
      .send({ name: 'X' });
    expect(res.status).toBe(404);
  });

  it('rejects an update that would empty the name or the JQL (400)', async () => {
    const created = await request(createApp())
      .post('/api/admin/queries')
      .set('Authorization', `Bearer ${tokenFor('ADMIN')}`)
      .send({ name: 'Export', jql: 'project = EXP' });

    const emptyName = await request(createApp())
      .put(`/api/admin/queries/${created.body.id}`)
      .set('Authorization', `Bearer ${tokenFor('ADMIN')}`)
      .send({ name: '   ' });
    expect(emptyName.status).toBe(400);

    const emptyJql = await request(createApp())
      .put(`/api/admin/queries/${created.body.id}`)
      .set('Authorization', `Bearer ${tokenFor('ADMIN')}`)
      .send({ jql: '   ' });
    expect(emptyJql.status).toBe(400);
  });

  it('deletes a query and logs DELETE_QUERY', async () => {
    const created = await request(createApp())
      .post('/api/admin/queries')
      .set('Authorization', `Bearer ${tokenFor('ADMIN')}`)
      .send({ name: 'Export', jql: 'project = EXP' });

    const res = await request(createApp())
      .delete(`/api/admin/queries/${created.body.id}`)
      .set('Authorization', `Bearer ${tokenFor('ADMIN')}`);

    expect(res.status).toBe(204);

    const listRes = await request(createApp())
      .get('/api/admin/queries')
      .set('Authorization', `Bearer ${tokenFor('ADMIN')}`);
    expect(listRes.body.queries).toHaveLength(0);

    const logs = fakePrisma.__state.auditLogs;
    expect(logs.find((l) => l.action === 'DELETE_QUERY' && l.entityKey === created.body.id)).toBeTruthy();
  });

  it('returns 404 when deleting an unknown query', async () => {
    const res = await request(createApp())
      .delete('/api/admin/queries/does-not-exist')
      .set('Authorization', `Bearer ${tokenFor('ADMIN')}`);
    expect(res.status).toBe(404);
  });
});

describe('GET /api/admin/jira-fields', () => {
  it('returns the Jira field catalog sorted by name', async () => {
    fakeJiraClient.getFieldsMeta.mockResolvedValue(
      new Map([
        ['customfield_10020', 'Profil Export'],
        ['summary', 'Summary'],
        ['customfield_10021', 'Offre Export'],
      ]),
    );

    const res = await request(createApp())
      .get('/api/admin/jira-fields')
      .set('Authorization', `Bearer ${tokenFor('ADMIN')}`);

    expect(res.status).toBe(200);
    expect(res.body.fields).toEqual([
      { id: 'customfield_10021', name: 'Offre Export' },
      { id: 'customfield_10020', name: 'Profil Export' },
      { id: 'summary', name: 'Summary' },
    ]);
  });
});

describe('attachments export jobs (background zip + resumable download)', () => {
  function meta(id: string, filename: string) {
    return {
      id,
      filename,
      mimeType: 'text/plain',
      size: 4,
      contentUrl: `https://jira.example.com/att/${id}`,
      authorId: 'someone',
      authorName: null,
    };
  }

  function summary(key: string, attachmentCount: number) {
    return {
      key,
      summary: key,
      status: null,
      statusCategory: null,
      issueType: null,
      extraFields: {},
      attachmentCounts: { all: attachmentCount, fromReporter: 0 },
    };
  }

  async function createAdmin() {
    return fakePrisma.user.create({
      data: { email: 'admin@example.com', name: 'Admin', passwordHash: 'x', role: 'ADMIN' },
    });
  }

  function start(queryId: string, sub: string, role: 'ADMIN' | 'USER' = 'ADMIN') {
    return request(createApp())
      .post(`/api/admin/queries/${queryId}/attachments-export`)
      .set('Authorization', `Bearer ${tokenFor(role, sub)}`);
  }

  function list(sub: string) {
    return request(createApp())
      .get('/api/admin/attachments-exports')
      .set('Authorization', `Bearer ${tokenFor('ADMIN', sub)}`);
  }

  function binary(req: request.Test) {
    return req.buffer(true).parse((res, cb) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => cb(null, Buffer.concat(chunks)));
    });
  }

  function stubJira() {
    fakeJiraClient.searchIssues.mockResolvedValue({
      issues: [summary('PROJ-1', 2), summary('PROJ-2', 0), summary('PROJ-3', 1)],
      total: 3,
    });
    fakeJiraClient.getAttachmentsWithReporter.mockImplementation(async (key: string) => ({
      attachments: key === 'PROJ-1' ? [meta('1', 'devis.pdf'), meta('2', 'photo.jpg')] : [meta('3', 'devis.pdf')],
      reporterId: 'reporter',
    }));
    fakeJiraClient.getAttachmentStream.mockImplementation(async (url: string) => {
      if (url.endsWith('/2')) throw new JiraApiError(404, 'Attachment fetch failed');
      return {
        body: Readable.toWeb(Readable.from([Buffer.from(`data:${url}`)])),
        contentType: 'text/plain',
        contentLength: null,
      };
    });
  }

  async function startAndFinish(adminId: string) {
    const query = await createSavedQuery({ name: 'Réclamations', jql: 'project = PROJ' });
    stubJira();
    const res = await start(query.id, adminId);
    await jobCompletion(res.body.id as string);
    const view = ((await list(adminId)).body.exports as Array<{ id: string; downloadUrl: string }>).find(
      (j) => j.id === res.body.id,
    )!;
    return { query, startRes: res, view };
  }

  let exportDirectory: string;

  beforeEach(async () => {
    exportDirectory = await mkdtemp(join(tmpdir(), 'jiv-admin-export-test-'));
    process.env.EXPORT_DIR = exportDirectory;
  });

  afterEach(async () => {
    await clearExportJobs();
    delete process.env.EXPORT_DIR;
    await rm(exportDirectory, { recursive: true, force: true });
  });

  it.each([
    ['post', '/api/admin/queries/any/attachments-export'],
    ['get', '/api/admin/attachments-exports'],
    ['delete', '/api/admin/attachments-exports/any'],
  ] as const)('rejects USER on %s %s (403)', async (method, path) => {
    const res = await request(createApp())[method](path).set('Authorization', `Bearer ${tokenFor('USER', 'user-1')}`);
    expect(res.status).toBe(403);
  });

  it('returns 404 for an unknown query', async () => {
    const admin = await createAdmin();
    expect((await start('nope', admin.id)).status).toBe(404);
  });

  it('starts the export in the background (202), then lists it as done with a download URL, and logs it', async () => {
    const admin = await createAdmin();
    const { query, startRes, view } = await startAndFinish(admin.id);

    expect(startRes.status).toBe(202);
    expect(['preparing', 'running']).toContain(startRes.body.status);
    expect(view).toMatchObject({ queryId: query.id, status: 'done', totalFiles: 3, doneFiles: 2, failedFiles: 1 });
    expect(view.downloadUrl).toMatch(/^\/api\/downloads\/attachments-export\/[A-Za-z0-9_-]{43}$/);
    expect(fakeJiraClient.getAttachmentsWithReporter.mock.calls.map((c) => c[0])).toEqual(['PROJ-1', 'PROJ-3']);
    expect(fakePrisma.__state.auditLogs.find((l: { action: string }) => l.action === 'EXPORT_ATTACHMENTS')).toMatchObject({
      userId: admin.id,
      entityType: 'saved_query',
      entityKey: query.id,
      details: { jql: 'project = PROJ', issueCount: 2 },
    });
  });

  it('serves the finished zip without an Authorization header, with its size and resumable ranges', async () => {
    const admin = await createAdmin();
    const { view } = await startAndFinish(admin.id);

    const res = await binary(request(createApp()).get(view.downloadUrl));
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/zip');
    expect(res.headers['accept-ranges']).toBe('bytes');
    expect(Number(res.headers['content-length'])).toBe((res.body as Buffer).length);
    expect(res.headers['content-disposition']).toMatch(/filename="pieces-jointes-reclamations-\d{4}-\d{2}-\d{2}\.zip"/);
    const files = readZip(res.body as Buffer);
    expect(Object.keys(files)).toEqual(['PROJ-1/devis.pdf', 'PROJ-3/devis.pdf', 'manifest.csv']);
    expect(files['manifest.csv']).toContain('PROJ-1;photo.jpg;;4;text/plain;erreur;HTTP 404');

    // Reprise d'un téléchargement interrompu.
    const partial = await binary(request(createApp()).get(view.downloadUrl).set('Range', 'bytes=10-'));
    expect(partial.status).toBe(206);
    expect((partial.body as Buffer).equals((res.body as Buffer).subarray(10))).toBe(true);
  });

  it('refuses a second export while one is running (409)', async () => {
    const admin = await createAdmin();
    const query = await createSavedQuery({ name: 'R', jql: 'project = PROJ' });
    stubJira();
    const pending: Array<() => void> = [];
    fakeJiraClient.getAttachmentsWithReporter.mockImplementation(
      () => new Promise((r) => pending.push(() => r({ attachments: [meta('1', 'a.txt')], reporterId: null }))),
    );
    const first = await start(query.id, admin.id);

    const second = await start(query.id, admin.id);
    expect(second.status).toBe(409);
    await vi.waitFor(() => expect(pending.length).toBeGreaterThan(0));
    pending.forEach((release) => release());
    await jobCompletion(first.body.id as string);
  });

  it('deletes an export: its download URL stops working', async () => {
    const admin = await createAdmin();
    const { view } = await startAndFinish(admin.id);

    const del = await request(createApp())
      .delete(`/api/admin/attachments-exports/${view.id}`)
      .set('Authorization', `Bearer ${tokenFor('ADMIN', admin.id)}`);
    expect(del.status).toBe(204);
    expect((await request(createApp()).get(view.downloadUrl)).status).toBe(404);
    expect((await list(admin.id)).body.exports).toEqual([]);
  });

  it('refuses the download if the admin who launched it was deactivated', async () => {
    const admin = await createAdmin();
    const { view } = await startAndFinish(admin.id);
    await fakePrisma.user.update({ where: { id: admin.id }, data: { active: false } });

    expect((await request(createApp()).get(view.downloadUrl)).status).toBe(403);
  });

  it('returns 404 for an unknown download token', async () => {
    expect((await request(createApp()).get('/api/downloads/attachments-export/nope')).status).toBe(404);
  });

  it('refuses with 422 when the query matches more tickets than can be exported', async () => {
    const admin = await createAdmin();
    const query = await createSavedQuery({ name: 'Big', jql: 'project = BIG' });
    fakeJiraClient.searchIssues.mockResolvedValue({ issues: [summary('BIG-1', 1)], total: 5000 });

    const res = await start(query.id, admin.id);
    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/5000/);
  });

  it('returns 404 when no ticket of the query has an attachment', async () => {
    const admin = await createAdmin();
    const query = await createSavedQuery({ name: 'Empty', jql: 'project = E' });
    fakeJiraClient.searchIssues.mockResolvedValue({ issues: [summary('E-1', 0)], total: 1 });

    expect((await start(query.id, admin.id)).status).toBe(404);
  });
});
