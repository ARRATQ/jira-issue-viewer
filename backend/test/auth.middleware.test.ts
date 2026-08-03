import { describe, expect, it, vi, beforeAll } from 'vitest';
import type { Request, Response } from 'express';
import { authMiddleware } from '../src/middleware/auth';
import { signAccessToken } from '../src/lib/tokens';

beforeAll(() => {
  process.env.JWT_SECRET = 'test-secret-for-unit-tests';
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-for-unit-tests';
});

function mockRes() {
  const res = {} as Response;
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

describe('authMiddleware', () => {
  it('rejects requests without an Authorization header', () => {
    const req = { headers: {} } as Request;
    const res = mockRes();
    const next = vi.fn();

    authMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Token manquant' });
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects requests with an invalid token', () => {
    const req = { headers: { authorization: 'Bearer not-a-real-token' } } as Request;
    const res = mockRes();
    const next = vi.fn();

    authMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Token invalide ou expiré' });
    expect(next).not.toHaveBeenCalled();
  });

  it('populates req.user and calls next() for a valid token', () => {
    const token = signAccessToken({ sub: 'user-1', email: 'a@example.com', role: 'USER' });
    const req = { headers: { authorization: `Bearer ${token}` } } as Request;
    const res = mockRes();
    const next = vi.fn();

    authMiddleware(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(req.user).toMatchObject({ sub: 'user-1', email: 'a@example.com', role: 'USER' });
    expect(res.status).not.toHaveBeenCalled();
  });
});
