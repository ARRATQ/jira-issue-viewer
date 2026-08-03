import { Router } from 'express';
import bcrypt from 'bcryptjs';
import type { Prisma, Role } from '@prisma/client';
import { authMiddleware } from '../middleware/auth';
import { requireAdmin } from '../middleware/roles';
import { asyncHandler } from '../lib/asyncHandler';
import { prisma } from '../lib/prisma';
import { getBranding, getPublicConfig, setBranding, setConfigValue } from '../services/config';
import { logAction } from '../services/audit';

export const adminRouter = Router();

adminRouter.use(authMiddleware, requireAdmin);

const USER_SELECT = {
  id: true,
  email: true,
  name: true,
  role: true,
  active: true,
  createdAt: true,
} satisfies Prisma.UserSelect;

// --- Config Jira + JQL ---

adminRouter.get(
  '/config',
  asyncHandler(async (_req, res) => {
    res.json(await getPublicConfig());
  }),
);

adminRouter.put(
  '/config',
  asyncHandler(async (req, res) => {
    const body = req.body as {
      jiraUrl?: string;
      jql?: string;
      pat?: string;
      tlsRejectUnauthorized?: boolean;
    };
    const changedKeys: string[] = [];

    if (body.jiraUrl !== undefined) {
      await setConfigValue('jira_url', body.jiraUrl);
      changedKeys.push('jira_url');
    }
    if (body.jql !== undefined) {
      await setConfigValue('jql', body.jql);
      changedKeys.push('jql');
    }
    if (body.pat !== undefined && body.pat.length > 0) {
      await setConfigValue('jira_pat', body.pat, { encrypted: true });
      changedKeys.push('jira_pat');
    }
    if (body.tlsRejectUnauthorized !== undefined) {
      await setConfigValue('jira_tls_reject_unauthorized', String(body.tlsRejectUnauthorized));
      changedKeys.push('jira_tls_reject_unauthorized');
    }

    // Le PAT lui-même n'est jamais consigné, seule la liste des clés modifiées l'est.
    await logAction({
      userId: req.user!.sub,
      action: 'UPDATE_CONFIG',
      entityType: 'config',
      details: { changedKeys },
      req,
    });

    res.json(await getPublicConfig());
  }),
);

// --- Personnalisation (nom de l'app + logo) ---

adminRouter.put(
  '/branding',
  asyncHandler(async (req, res) => {
    const body = req.body as { appName?: string; logoDataUrl?: string | null };

    try {
      await setBranding(body);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Requête invalide' });
      return;
    }

    await logAction({
      userId: req.user!.sub,
      action: 'UPDATE_CONFIG',
      entityType: 'branding',
      details: { changedKeys: Object.keys(body) },
      req,
    });

    res.json(await getBranding());
  }),
);

// --- Gestion des comptes ---

adminRouter.get(
  '/users',
  asyncHandler(async (_req, res) => {
    const users = await prisma.user.findMany({
      select: USER_SELECT,
      orderBy: { createdAt: 'asc' },
    });
    res.json({ users });
  }),
);

adminRouter.post(
  '/users',
  asyncHandler(async (req, res) => {
    const { email, name, password, role } = req.body as {
      email?: string;
      name?: string;
      password?: string;
      role?: Role;
    };
    if (!email || !name || !password) {
      res.status(400).json({ error: 'email, name et password sont requis' });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: { email, name, passwordHash, role: role ?? 'USER' },
      select: USER_SELECT,
    });

    await logAction({
      userId: req.user!.sub,
      action: 'CREATE_USER',
      entityType: 'user',
      entityKey: user.id,
      details: { email: user.email, role: user.role },
      req,
    });

    res.status(201).json(user);
  }),
);

adminRouter.patch(
  '/users/:id',
  asyncHandler(async (req, res) => {
    const { name, role, active, password } = req.body as {
      name?: string;
      role?: Role;
      active?: boolean;
      password?: string;
    };

    const data: Prisma.UserUpdateInput = {};
    if (name !== undefined) data.name = name;
    if (role !== undefined) data.role = role;
    if (active !== undefined) data.active = active;
    if (password) data.passwordHash = await bcrypt.hash(password, 12);

    const user = await prisma.user.update({
      where: { id: req.params.id },
      data,
      select: USER_SELECT,
    });

    const action = active === false ? 'DEACTIVATE_USER' : 'UPDATE_USER';
    await logAction({
      userId: req.user!.sub,
      action,
      entityType: 'user',
      entityKey: user.id,
      details: { changed: Object.keys(data) },
      req,
    });

    res.json(user);
  }),
);

// --- Logs d'audit ---

adminRouter.get(
  '/audit-logs',
  asyncHandler(async (req, res) => {
    const page = Math.max(1, Number(req.query.page ?? 1));
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize ?? 25)));
    const { userId, action, from, to } = req.query as Record<string, string | undefined>;

    const where: Prisma.AuditLogWhereInput = {
      ...(userId ? { userId } : {}),
      ...(action ? { action } : {}),
      ...(from || to
        ? {
            createdAt: {
              ...(from ? { gte: new Date(from) } : {}),
              ...(to ? { lte: new Date(to) } : {}),
            },
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { user: { select: { email: true, name: true } } },
      }),
      prisma.auditLog.count({ where }),
    ]);

    res.json({ items, total, page, pageSize });
  }),
);
