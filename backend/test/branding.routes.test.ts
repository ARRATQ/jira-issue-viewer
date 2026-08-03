import { describe, expect, it, beforeAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { createFakePrisma } from './helpers/fakePrisma';

const fakePrisma = createFakePrisma();
vi.mock('../src/lib/prisma', () => ({ prisma: fakePrisma }));

beforeAll(() => {
  process.env.ENCRYPTION_KEY = 'd'.repeat(64);
});

beforeEach(() => {
  fakePrisma.reset();
});

const { createApp } = await import('../src/app');
const { setBranding } = await import('../src/services/config');

describe('GET /api/branding', () => {
  it('is publicly accessible without authentication', async () => {
    const res = await request(createApp()).get('/api/branding');
    expect(res.status).toBe(200);
    expect(res.body.appName).toBe('jira-issue-viewer');
    expect(res.body.logoDataUrl).toBeNull();
    expect(typeof res.body.confidentialityNotice).toBe('string');
    expect(res.body.confidentialityNotice.length).toBeGreaterThan(0);
  });

  it('reflects whatever the admin has configured', async () => {
    await setBranding({ appName: 'Maroc PME Portail' });
    const res = await request(createApp()).get('/api/branding');
    expect(res.body.appName).toBe('Maroc PME Portail');
  });
});
