import { describe, expect, it, beforeAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import { createFakePrisma } from './helpers/fakePrisma';

const fakePrisma = createFakePrisma();
vi.mock('../src/lib/prisma', () => ({ prisma: fakePrisma }));

beforeAll(() => {
  process.env.JWT_SECRET = 'test-secret';
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
});

beforeEach(async () => {
  fakePrisma.reset();
  await fakePrisma.user.create({
    data: {
      id: 'user-1',
      email: 'user@example.com',
      name: 'Jane Doe',
      passwordHash: await bcrypt.hash('Origin4l!Pass', 12),
      role: 'USER',
      active: true,
    },
  });
});

const { createApp } = await import('../src/app');

describe('POST /api/auth/login', () => {
  it('rejects login without accepting the confidentiality notice (400)', async () => {
    const res = await request(createApp())
      .post('/api/auth/login')
      .send({ email: 'user@example.com', password: 'Origin4l!Pass' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/confidentialité/);
  });

  it('logs in with correct credentials and acceptance', async () => {
    const res = await request(createApp())
      .post('/api/auth/login')
      .send({ email: 'user@example.com', password: 'Origin4l!Pass', acceptedConfidentiality: true });

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeTruthy();
    expect(res.body.user).toMatchObject({ email: 'user@example.com', role: 'USER' });
  });

  it('rejects an incorrect password and logs LOGIN_FAILED', async () => {
    const res = await request(createApp())
      .post('/api/auth/login')
      .send({ email: 'user@example.com', password: 'wrong', acceptedConfidentiality: true });

    expect(res.status).toBe(401);
    const logs = fakePrisma.__state.auditLogs;
    expect(logs.find((l) => l.action === 'LOGIN_FAILED')).toBeTruthy();
  });
});

describe('PATCH /api/auth/password', () => {
  async function loginToken() {
    const res = await request(createApp())
      .post('/api/auth/login')
      .send({ email: 'user@example.com', password: 'Origin4l!Pass', acceptedConfidentiality: true });
    return res.body.accessToken as string;
  }

  it('rejects requests without a token (401)', async () => {
    const res = await request(createApp())
      .patch('/api/auth/password')
      .send({ currentPassword: 'Origin4l!Pass', newPassword: 'N3w!Password' });
    expect(res.status).toBe(401);
  });

  it('rejects an incorrect current password (400)', async () => {
    const token = await loginToken();
    const res = await request(createApp())
      .patch('/api/auth/password')
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: 'wrong-current', newPassword: 'N3w!Password' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/actuel incorrect/);
  });

  it('rejects a new password that does not meet the strength policy (400)', async () => {
    const token = await loginToken();
    const res = await request(createApp())
      .patch('/api/auth/password')
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: 'Origin4l!Pass', newPassword: 'weak' });
    expect(res.status).toBe(400);
  });

  it('changes the password, logs CHANGE_PASSWORD, and allows login with the new password', async () => {
    const token = await loginToken();
    const res = await request(createApp())
      .patch('/api/auth/password')
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: 'Origin4l!Pass', newPassword: 'N3w!Password' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });

    const logs = fakePrisma.__state.auditLogs;
    expect(logs.find((l) => l.action === 'CHANGE_PASSWORD')).toBeTruthy();

    const loginRes = await request(createApp())
      .post('/api/auth/login')
      .send({ email: 'user@example.com', password: 'N3w!Password', acceptedConfidentiality: true });
    expect(loginRes.status).toBe(200);

    const oldPasswordRes = await request(createApp())
      .post('/api/auth/login')
      .send({ email: 'user@example.com', password: 'Origin4l!Pass', acceptedConfidentiality: true });
    expect(oldPasswordRes.status).toBe(401);
  });
});
