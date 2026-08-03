import { describe, expect, it, beforeAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { createFakePrisma } from './helpers/fakePrisma';

const fakePrisma = createFakePrisma();
vi.mock('../src/lib/prisma', () => ({ prisma: fakePrisma }));

beforeAll(() => {
  process.env.JWT_SECRET = 'test-secret';
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
  process.env.ENCRYPTION_KEY = 'c'.repeat(64);
});

beforeEach(() => {
  fakePrisma.reset();
});

const { createApp } = await import('../src/app');
const { signAccessToken } = await import('../src/lib/tokens');

function tokenFor(role: 'ADMIN' | 'USER', sub = 'admin-1') {
  return signAccessToken({ sub, email: `${sub}@example.com`, role });
}

describe('role gating on /api/admin/*', () => {
  it.each([
    ['/api/admin/config', 'get'],
    ['/api/admin/users', 'get'],
    ['/api/admin/audit-logs', 'get'],
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
  it('updates JQL/URL, encrypts the PAT, never returns it, and logs UPDATE_CONFIG without the PAT value', async () => {
    const res = await request(createApp())
      .put('/api/admin/config')
      .set('Authorization', `Bearer ${tokenFor('ADMIN')}`)
      .send({ jiraUrl: 'https://jira.example.com', jql: 'project = PROJ', pat: 'super-secret-pat' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      jiraUrl: 'https://jira.example.com',
      jql: 'project = PROJ',
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
      .send({ email: 'new@example.com', name: 'New User', password: 'p@ssw0rd', role: 'USER' });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ email: 'new@example.com', role: 'USER', active: true });
    expect(res.body.passwordHash).toBeUndefined();

    const logs = fakePrisma.__state.auditLogs;
    expect(logs.find((l) => l.action === 'CREATE_USER')).toBeTruthy();
  });

  it('rejects user creation with missing fields (400)', async () => {
    const res = await request(createApp())
      .post('/api/admin/users')
      .set('Authorization', `Bearer ${tokenFor('ADMIN')}`)
      .send({ email: 'incomplete@example.com' });
    expect(res.status).toBe(400);
  });

  it('logs DEACTIVATE_USER (not UPDATE_USER) when active is set to false', async () => {
    const created = await request(createApp())
      .post('/api/admin/users')
      .set('Authorization', `Bearer ${tokenFor('ADMIN')}`)
      .send({ email: 'todeactivate@example.com', name: 'To Deactivate', password: 'p@ssw0rd' });

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
      .send({ email: 'rename@example.com', name: 'Old Name', password: 'p@ssw0rd' });

    const res = await request(createApp())
      .patch(`/api/admin/users/${created.body.id}`)
      .set('Authorization', `Bearer ${tokenFor('ADMIN')}`)
      .send({ name: 'New Name' });

    expect(res.status).toBe(200);
    expect(res.body.name).toBe('New Name');

    const logs = fakePrisma.__state.auditLogs;
    expect(logs.find((l) => l.action === 'UPDATE_USER')).toBeTruthy();
  });
});

describe('GET /api/admin/audit-logs', () => {
  it('paginates and filters by action', async () => {
    await request(createApp())
      .post('/api/admin/users')
      .set('Authorization', `Bearer ${tokenFor('ADMIN')}`)
      .send({ email: 'a@example.com', name: 'A', password: 'p@ssw0rd' });
    await request(createApp())
      .put('/api/admin/config')
      .set('Authorization', `Bearer ${tokenFor('ADMIN')}`)
      .send({ jql: 'project = X' });

    const res = await request(createApp())
      .get('/api/admin/audit-logs?action=CREATE_USER')
      .set('Authorization', `Bearer ${tokenFor('ADMIN')}`);

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].action).toBe('CREATE_USER');
  });
});
