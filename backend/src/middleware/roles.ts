import type { NextFunction, Request, Response } from 'express';
import type { Role } from '../lib/tokens';

export function requireRole(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Non authentifié' });
      return;
    }
    if (!roles.includes(req.user.role)) {
      res.status(403).json({ error: 'Accès interdit pour ce rôle' });
      return;
    }
    next();
  };
}

export const requireAdmin = requireRole('ADMIN');
