import { Router } from 'express';
import bcrypt from 'bcryptjs';
import type { Prisma, Role } from '@prisma/client';
import { authMiddleware } from '../middleware/auth';
import { requireAdmin } from '../middleware/roles';
import { asyncHandler } from '../lib/asyncHandler';
import { prisma } from '../lib/prisma';
import { getBranding, getJiraClientConfig, getPublicConfig, setBranding, setConfigValue } from '../services/config';
import { logAction } from '../services/audit';
import { validatePasswordStrength } from '../lib/passwordPolicy';
import { JiraClient } from '../lib/jira';
import {
  createQuery,
  deleteQuery,
  getQueryById,
  listQueriesFull,
  updateQuery,
  type FieldRef,
  type QueryTab,
} from '../services/savedQueries';

export const adminRouter = Router();

adminRouter.use(authMiddleware, requireAdmin);

// Volontairement simple : on vérifie la forme générale, pas la délivrabilité.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const USER_SELECT = {
  id: true,
  email: true,
  name: true,
  role: true,
  active: true,
  mustChangePassword: true,
  createdAt: true,
} satisfies Prisma.UserSelect;

// --- Config Jira (URL/PAT/TLS) ---
// Le JQL n'est plus configuré ici : voir la section "Requêtes sauvegardées"
// plus bas, chaque requête portant désormais le sien.

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
      pat?: string;
      tlsRejectUnauthorized?: boolean;
    };
    const changedKeys: string[] = [];

    if (body.jiraUrl !== undefined) {
      await setConfigValue('jira_url', body.jiraUrl);
      changedKeys.push('jira_url');
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
    const body = req.body as { appName?: string; logoDataUrl?: string | null; confidentialityNotice?: string };

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
    const { email, name, password, role, mustChangePassword } = req.body as {
      email?: string;
      name?: string;
      password?: string;
      role?: Role;
      mustChangePassword?: boolean;
    };
    if (!email || !name || !password) {
      res.status(400).json({ error: 'email, name et password sont requis' });
      return;
    }
    try {
      validatePasswordStrength(password);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Mot de passe invalide' });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 12);
    // Mot de passe défini par l'admin : par défaut l'utilisateur devra le
    // remplacer à sa première connexion ; l'admin peut lever l'exigence via la
    // case à cocher du formulaire.
    const user = await prisma.user.create({
      data: { email, name, passwordHash, role: role ?? 'USER', mustChangePassword: mustChangePassword ?? true },
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

interface UpdateUserBody {
  email?: string;
  name?: string;
  role?: Role;
  active?: boolean;
  password?: string;
  mustChangePassword?: boolean;
}

// Validation des champs modifiables par l'admin. Renvoie un message d'erreur
// destiné au client, ou null si la requête est acceptable.
function validateUserUpdate(body: UpdateUserBody, isSelf: boolean): string | null {
  if (body.email !== undefined && !EMAIL_RE.test(body.email.trim())) return 'Adresse email invalide';
  if (body.name !== undefined && body.name.trim().length === 0) return 'Le nom ne peut pas être vide';
  if (body.role !== undefined && body.role !== 'ADMIN' && body.role !== 'USER') return 'Rôle invalide';
  // Un admin qui se désactive ou se rétrograde perdrait l'accès à cette page.
  if (isSelf && (body.active === false || body.role === 'USER')) {
    return 'Vous ne pouvez pas désactiver ni rétrograder votre propre compte';
  }
  if (body.password) {
    try {
      validatePasswordStrength(body.password);
    } catch (err) {
      return err instanceof Error ? err.message : 'Mot de passe invalide';
    }
  }
  return null;
}

adminRouter.patch(
  '/users/:id',
  asyncHandler(async (req, res) => {
    const body = req.body as UpdateUserBody;
    const { name, role, active, password, mustChangePassword } = body;

    const validationError = validateUserUpdate(body, req.params.id === req.user!.sub);
    if (validationError) {
      res.status(400).json({ error: validationError });
      return;
    }

    const existing = await prisma.user.findUnique({ where: { id: req.params.id }, select: { id: true } });
    if (!existing) {
      res.status(404).json({ error: 'Compte introuvable' });
      return;
    }

    const email = body.email?.trim();
    if (email !== undefined) {
      const owner = await prisma.user.findUnique({ where: { email }, select: { id: true } });
      if (owner && owner.id !== existing.id) {
        res.status(409).json({ error: 'Cette adresse email est déjà utilisée par un autre compte' });
        return;
      }
    }

    const data: Prisma.UserUpdateInput = {};
    if (email !== undefined) data.email = email;
    if (name !== undefined) data.name = name.trim();
    if (role !== undefined) data.role = role;
    if (active !== undefined) data.active = active;
    if (password) {
      // Réinitialisation par l'admin = mot de passe temporaire : on force son
      // remplacement à la prochaine connexion de l'utilisateur.
      data.passwordHash = await bcrypt.hash(password, 12);
      data.mustChangePassword = true;
    }
    // La case à cocher de la liste permet d'exiger (ou de lever) un changement
    // de mot de passe sans réinitialiser celui-ci ; explicite ⇒ prioritaire.
    if (mustChangePassword !== undefined) data.mustChangePassword = mustChangePassword;

    const user = await prisma.user.update({
      where: { id: req.params.id },
      data,
      select: USER_SELECT,
    });

    // Seule la liste des champs modifiés est consignée, jamais le mot de passe.
    const action = active === false ? 'DEACTIVATE_USER' : password ? 'RESET_PASSWORD' : 'UPDATE_USER';
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

// --- Requêtes JQL sauvegardées ---

interface QueryRequestBody {
  name?: string;
  jql?: string;
  position?: number;
  listColumns?: FieldRef[];
  tabs?: QueryTab[];
  autresVisibleToUser?: boolean;
}

adminRouter.get(
  '/queries',
  asyncHandler(async (_req, res) => {
    res.json({ queries: await listQueriesFull() });
  }),
);

adminRouter.post(
  '/queries',
  asyncHandler(async (req, res) => {
    const body = req.body as QueryRequestBody;
    if (!body.name || !body.name.trim()) {
      res.status(400).json({ error: 'Le nom de la requête est requis' });
      return;
    }
    if (!body.jql || !body.jql.trim()) {
      res.status(400).json({ error: 'Le JQL est requis' });
      return;
    }

    const query = await createQuery({
      name: body.name,
      jql: body.jql,
      position: body.position,
      listColumns: body.listColumns,
      tabs: body.tabs,
      autresVisibleToUser: body.autresVisibleToUser,
    });

    await logAction({
      userId: req.user!.sub,
      action: 'SAVE_QUERY',
      entityType: 'saved_query',
      entityKey: query.id,
      details: { name: query.name, created: true },
      req,
    });

    res.status(201).json(query);
  }),
);

adminRouter.put(
  '/queries/:queryId',
  asyncHandler(async (req, res) => {
    const existing = await getQueryById(req.params.queryId!);
    if (!existing) {
      res.status(404).json({ error: 'Requête introuvable' });
      return;
    }

    const body = req.body as QueryRequestBody;
    if (body.name !== undefined && !body.name.trim()) {
      res.status(400).json({ error: 'Le nom de la requête ne peut pas être vide' });
      return;
    }
    if (body.jql !== undefined && !body.jql.trim()) {
      res.status(400).json({ error: 'Le JQL ne peut pas être vide' });
      return;
    }

    const query = await updateQuery(req.params.queryId!, body);

    await logAction({
      userId: req.user!.sub,
      action: 'SAVE_QUERY',
      entityType: 'saved_query',
      entityKey: query.id,
      details: { name: query.name, changed: Object.keys(body) },
      req,
    });

    res.json(query);
  }),
);

adminRouter.delete(
  '/queries/:queryId',
  asyncHandler(async (req, res) => {
    const existing = await getQueryById(req.params.queryId!);
    if (!existing) {
      res.status(404).json({ error: 'Requête introuvable' });
      return;
    }

    await deleteQuery(req.params.queryId!);

    await logAction({
      userId: req.user!.sub,
      action: 'DELETE_QUERY',
      entityType: 'saved_query',
      entityKey: existing.id,
      details: { name: existing.name },
      req,
    });

    res.status(204).end();
  }),
);

// --- Catalogue de champs Jira (alimente le sélecteur de champs admin) ---

adminRouter.get(
  '/jira-fields',
  asyncHandler(async (_req, res) => {
    const client = new JiraClient(await getJiraClientConfig());
    const fieldsMeta = await client.getFieldsMeta();
    const fields = [...fieldsMeta.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
    res.json({ fields });
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
