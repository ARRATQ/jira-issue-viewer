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
    expect(res.body.user).toMatchObject({ email: 'user@example.com', role: 'USER', mustChangePassword: false });
  });

  it('returns mustChangePassword=true for an account whose password was set by an admin', async () => {
    await fakePrisma.user.create({
      data: {
        id: 'user-temp',
        email: 'temp@example.com',
        name: 'Temp User',
        passwordHash: await bcrypt.hash('T3mp!Pass', 12),
        role: 'USER',
        active: true,
        mustChangePassword: true,
      },
    });

    const res = await request(createApp())
      .post('/api/auth/login')
      .send({ email: 'temp@example.com', password: 'T3mp!Pass', acceptedConfidentiality: true });

    expect(res.status).toBe(200);
    expect(res.body.user.mustChangePassword).toBe(true);
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

  it('clears the forced-change flag once the user sets their own password', async () => {
    await fakePrisma.user.create({
      data: {
        id: 'user-temp',
        email: 'temp@example.com',
        name: 'Temp User',
        passwordHash: await bcrypt.hash('T3mp!Pass', 12),
        role: 'USER',
        active: true,
        mustChangePassword: true,
      },
    });
    const loginRes = await request(createApp())
      .post('/api/auth/login')
      .send({ email: 'temp@example.com', password: 'T3mp!Pass', acceptedConfidentiality: true });
    const token = loginRes.body.accessToken as string;

    const res = await request(createApp())
      .patch('/api/auth/password')
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: 'T3mp!Pass', newPassword: 'N3w!Password' });
    expect(res.status).toBe(200);

    const after = await request(createApp())
      .post('/api/auth/login')
      .send({ email: 'temp@example.com', password: 'N3w!Password', acceptedConfidentiality: true });
    expect(after.body.user.mustChangePassword).toBe(false);
  });
});
