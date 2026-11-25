import { describe, expect, it, beforeAll, beforeEach, vi } from 'vitest';
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

describe('attachments export (prepare + one-time download)', () => {
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

  function prepare(queryId: string, sub: string, role: 'ADMIN' | 'USER' = 'ADMIN') {
    return request(createApp())
      .post(`/api/admin/queries/${queryId}/attachments-export`)
      .set('Authorization', `Bearer ${tokenFor(role, sub)}`);
  }

  async function download(url: string) {
    return request(createApp())
      .get(url)
      .buffer(true)
      .parse((res, cb) => {
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

  it('rejects USER on prepare (403)', async () => {
    const res = await prepare('any', 'user-1', 'USER');
    expect(res.status).toBe(403);
  });

  it('returns 404 for an unknown query', async () => {
    const admin = await createAdmin();
    const res = await prepare('nope', admin.id);
    expect(res.status).toBe(404);
  });

  it('prepares the export: summary and a one-time download URL, without calling Jira for empty tickets', async () => {
    const admin = await createAdmin();
    const query = await createSavedQuery({ name: 'Réclamations', jql: 'project = PROJ' });
    stubJira();

    const res = await prepare(query.id, admin.id);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ issueCount: 2, fileCount: 3, totalBytes: 12 });
    expect(res.body.downloadUrl).toMatch(/^\/api\/downloads\/attachments-export\/[A-Za-z0-9_-]{43}$/);
    expect(fakeJiraClient.getAttachmentsWithReporter.mock.calls.map((c) => c[0])).toEqual(['PROJ-1', 'PROJ-3']);
    expect(fakeJiraClient.getAttachmentStream).not.toHaveBeenCalled();
  });

  it('streams the zip without an Authorization header, skips files Jira refuses, and logs the export', async () => {
    const admin = await createAdmin();
    const query = await createSavedQuery({ name: 'Réclamations', jql: 'project = PROJ' });
    stubJira();
    const { downloadUrl } = (await prepare(query.id, admin.id)).body as { downloadUrl: string };

    const res = await download(downloadUrl);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/zip');
    expect(res.headers['content-disposition']).toMatch(/^attachment; filename="pieces-jointes-reclamations-\d{4}-\d{2}-\d{2}\.zip"$/);
    const files = readZip(res.body as Buffer);
    expect(Object.keys(files)).toEqual(['PROJ-1/devis.pdf', 'PROJ-3/devis.pdf', 'manifest.csv']);
    expect(files['manifest.csv']!.split('\r\n')).toEqual([
      '\uFEFFcle_ticket;nom_fichier;chemin_dans_zip;taille_octets;type_mime;statut;erreur',
      'PROJ-1;devis.pdf;PROJ-1/devis.pdf;4;text/plain;ok;',
      'PROJ-1;photo.jpg;;4;text/plain;erreur;HTTP 404',
      'PROJ-3;devis.pdf;PROJ-3/devis.pdf;4;text/plain;ok;',
      '',
    ]);
    expect(fakePrisma.__state.auditLogs.at(-1)).toMatchObject({
      action: 'EXPORT_ATTACHMENTS',
      userId: admin.id,
      entityType: 'saved_query',
      entityKey: query.id,
      details: { jql: 'project = PROJ', issueCount: 2, fileCount: 3 },
    });
  });

  it('refuses a download URL used a second time', async () => {
    const admin = await createAdmin();
    const query = await createSavedQuery({ name: 'R', jql: 'project = PROJ' });
    stubJira();
    const { downloadUrl } = (await prepare(query.id, admin.id)).body as { downloadUrl: string };
    await download(downloadUrl);

    const again = await request(createApp()).get(downloadUrl);
    expect(again.status).toBe(404);
  });

  it('refuses the download if the admin was deactivated in the meantime', async () => {
    const admin = await createAdmin();
    const query = await createSavedQuery({ name: 'R', jql: 'project = PROJ' });
    stubJira();
    const { downloadUrl } = (await prepare(query.id, admin.id)).body as { downloadUrl: string };
    await fakePrisma.user.update({ where: { id: admin.id }, data: { active: false } });

    const res = await request(createApp()).get(downloadUrl);
    expect(res.status).toBe(403);
    expect(fakeJiraClient.getAttachmentStream).not.toHaveBeenCalled();
  });

  it('refuses with 422 when the query matches more tickets than can be exported', async () => {
    const admin = await createAdmin();
    const query = await createSavedQuery({ name: 'Big', jql: 'project = BIG' });
    fakeJiraClient.searchIssues.mockResolvedValue({ issues: [summary('BIG-1', 1)], total: 5000 });

    const res = await prepare(query.id, admin.id);

    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/5000/);
  });

  it('returns 404 when no ticket of the query has an attachment', async () => {
    const admin = await createAdmin();
    const query = await createSavedQuery({ name: 'Empty', jql: 'project = E' });
    fakeJiraClient.searchIssues.mockResolvedValue({ issues: [summary('E-1', 0)], total: 1 });

    const res = await prepare(query.id, admin.id);
    expect(res.status).toBe(404);
  });
});
