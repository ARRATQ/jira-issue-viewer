import { randomUUID } from 'node:crypto';

// Faux client Prisma en mémoire, utilisé pour les tests de routes quand
// aucune instance Postgres n'est disponible (voir docs/planning/03-implementation-plan.md,
// Phase 3 : à remplacer par de vraies intégrations DB dès qu'un Postgres de
// test est disponible, ex. via `docker compose` en Phase 7). Couvre
// uniquement le sous-ensemble de l'API Prisma réellement utilisé par les
// services et routes du backend.

export interface FakeUser {
  id: string;
  email: string;
  passwordHash: string;
  name: string;
  role: 'ADMIN' | 'USER';
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface FakeAppConfig {
  key: string;
  value: string;
  encrypted: boolean;
  updatedAt: Date;
}

export interface FakeAuditLog {
  id: string;
  userId: string;
  action: string;
  entityType: string | null;
  entityKey: string | null;
  details: unknown;
  ipAddress: string | null;
  createdAt: Date;
}

export interface FakeSavedQuery {
  id: string;
  name: string;
  jql: string;
  position: number;
  listColumns: unknown;
  tabs: unknown;
  autresVisibleToUser: boolean;
  createdAt: Date;
  updatedAt: Date;
}

type Select = Record<string, boolean> | undefined;

function pick<T extends Record<string, unknown>>(obj: T, select: Select): Partial<T> {
  if (!select) return obj;
  const out: Partial<T> = {};
  for (const k of Object.keys(select)) {
    if (select[k]) (out as Record<string, unknown>)[k] = obj[k];
  }
  return out;
}

function matchesAuditWhere(log: FakeAuditLog, where: Record<string, unknown> = {}): boolean {
  if (where.userId && log.userId !== where.userId) return false;
  if (where.action && log.action !== where.action) return false;
  const createdAt = where.createdAt as { gte?: Date; lte?: Date } | undefined;
  if (createdAt?.gte && log.createdAt < createdAt.gte) return false;
  if (createdAt?.lte && log.createdAt > createdAt.lte) return false;
  return true;
}

export function createFakePrisma() {
  const users = new Map<string, FakeUser>();
  const configs = new Map<string, FakeAppConfig>();
  const auditLogs: FakeAuditLog[] = [];
  const savedQueries = new Map<string, FakeSavedQuery>();

  const state = { users, configs, auditLogs, savedQueries };

  return {
    __state: state,
    reset() {
      users.clear();
      configs.clear();
      auditLogs.length = 0;
      savedQueries.clear();
    },

    user: {
      async findUnique({ where, select }: { where: { id?: string; email?: string }; select?: Select }) {
        const user = where.id
          ? users.get(where.id)
          : [...users.values()].find((u) => u.email === where.email);
        if (!user) return null;
        return pick(user, select);
      },
      async findMany({ select, orderBy }: { select?: Select; orderBy?: { createdAt?: 'asc' | 'desc' } } = {}) {
        let list = [...users.values()];
        if (orderBy?.createdAt === 'asc') list.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
        if (orderBy?.createdAt === 'desc') list.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        return list.map((u) => pick(u, select));
      },
      async create({ data, select }: { data: Partial<FakeUser>; select?: Select }) {
        const now = new Date();
        const user: FakeUser = {
          id: randomUUID(),
          active: true,
          role: 'USER',
          createdAt: now,
          updatedAt: now,
          ...data,
        } as FakeUser;
        users.set(user.id, user);
        return pick(user, select);
      },
      async update({ where, data, select }: { where: { id: string }; data: Partial<FakeUser>; select?: Select }) {
        const user = users.get(where.id);
        if (!user) throw new Error(`User not found: ${where.id}`);
        Object.assign(user, data, { updatedAt: new Date() });
        return pick(user, select);
      },
    },

    appConfig: {
      async findUnique({ where }: { where: { key: string } }) {
        return configs.get(where.key) ?? null;
      },
      async upsert({
        where,
        create,
        update,
      }: {
        where: { key: string };
        create: FakeAppConfig;
        update: Partial<FakeAppConfig>;
      }) {
        const existing = configs.get(where.key);
        const now = new Date();
        const row: FakeAppConfig = existing
          ? { ...existing, ...update, updatedAt: now }
          : { ...create, updatedAt: now };
        configs.set(where.key, row);
        return row;
      },
    },

    auditLog: {
      async create({ data }: { data: Partial<FakeAuditLog> & { userId: string; action: string } }) {
        const row: FakeAuditLog = {
          id: randomUUID(),
          createdAt: new Date(),
          entityType: null,
          entityKey: null,
          details: null,
          ipAddress: null,
          ...data,
        };
        auditLogs.push(row);
        return row;
      },
      async findMany({
        where,
        orderBy,
        skip = 0,
        take,
        include,
      }: {
        where?: Record<string, unknown>;
        orderBy?: { createdAt?: 'asc' | 'desc' };
        skip?: number;
        take?: number;
        include?: { user?: { select: Select } };
      } = {}) {
        let list = auditLogs.filter((l) => matchesAuditWhere(l, where));
        if (orderBy?.createdAt === 'desc') list = [...list].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        if (orderBy?.createdAt === 'asc') list = [...list].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
        list = list.slice(skip, take ? skip + take : undefined);
        if (include?.user) {
          return list.map((l) => {
            const user = users.get(l.userId);
            return { ...l, user: user ? pick(user, include.user!.select) : null };
          });
        }
        return list;
      },
      async count({ where }: { where?: Record<string, unknown> } = {}) {
        return auditLogs.filter((l) => matchesAuditWhere(l, where)).length;
      },
    },

    savedQuery: {
      async count() {
        return savedQueries.size;
      },
      async findMany({ orderBy, select }: { orderBy?: { position?: 'asc' | 'desc' }; select?: Select } = {}) {
        let list = [...savedQueries.values()];
        if (orderBy?.position === 'asc') list.sort((a, b) => a.position - b.position);
        if (orderBy?.position === 'desc') list.sort((a, b) => b.position - a.position);
        return list.map((q) => pick(q, select));
      },
      async findUnique({ where }: { where: { id: string } }) {
        return savedQueries.get(where.id) ?? null;
      },
      async create({ data }: { data: Partial<FakeSavedQuery> }) {
        const now = new Date();
        const row: FakeSavedQuery = {
          id: randomUUID(),
          position: 0,
          listColumns: [],
          tabs: [],
          autresVisibleToUser: false,
          createdAt: now,
          updatedAt: now,
          ...data,
        } as FakeSavedQuery;
        savedQueries.set(row.id, row);
        return row;
      },
      async update({ where, data }: { where: { id: string }; data: Partial<FakeSavedQuery> }) {
        const row = savedQueries.get(where.id);
        if (!row) throw new Error(`SavedQuery not found: ${where.id}`);
        Object.assign(row, data, { updatedAt: new Date() });
        return row;
      },
      async delete({ where }: { where: { id: string } }) {
        const row = savedQueries.get(where.id);
        if (!row) throw new Error(`SavedQuery not found: ${where.id}`);
        savedQueries.delete(where.id);
        return row;
      },
    },
  };
}

export type FakePrisma = ReturnType<typeof createFakePrisma>;
