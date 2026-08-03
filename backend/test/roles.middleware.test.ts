import { describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';
import { requireRole, requireAdmin } from '../src/middleware/roles';
import type { AccessTokenPayload } from '../src/lib/tokens';

function mockRes() {
  const res = {} as Response;
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

function mockReq(user?: AccessTokenPayload): Request {
  return { user } as Request;
}

describe('requireRole', () => {
  it('returns 401 when no user is attached to the request', () => {
    const req = mockReq(undefined);
    const res = mockRes();
    const next = vi.fn();

    requireRole('ADMIN')(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 403 when the user role is not in the allowed list', () => {
    const req = mockReq({ sub: 'u1', email: 'u@example.com', role: 'USER' });
    const res = mockRes();
    const next = vi.fn();

    requireRole('ADMIN')(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('calls next() when the user role is allowed', () => {
    const req = mockReq({ sub: 'u1', email: 'admin@example.com', role: 'ADMIN' });
    const res = mockRes();
    const next = vi.fn();

    requireAdmin(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });
});
