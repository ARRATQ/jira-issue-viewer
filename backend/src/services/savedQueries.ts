import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';

// fieldId est informationnel (rempli par le sélecteur de champs admin,
// alimenté par le catalogue Jira live) : le matching réel se fait par nom,
// exactement comme le regroupement de champs déjà en place — voir
// frontend/src/lib/issueFieldGroups.ts. Ça évite de dépendre d'un accès
// Jira au moment où une requête est créée/migrée.
export interface FieldRef {
  fieldName: string;
  fieldId?: string;
}

export interface QueryTab {
  id: string;
  label: string;
  position: number;
  visibleToUser: boolean;
  fields: FieldRef[];
}

export interface SavedQueryRecord {
  id: string;
  name: string;
  jql: string;
  position: number;
  listColumns: FieldRef[];
  tabs: QueryTab[];
  autresVisibleToUser: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface SavedQuerySummary {
  id: string;
  name: string;
  position: number;
}

function isFieldRef(value: unknown): value is FieldRef {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as Record<string, unknown>;
  return typeof obj.fieldName === 'string' && (obj.fieldId === undefined || typeof obj.fieldId === 'string');
}

function parseFieldRefs(raw: Prisma.JsonValue): FieldRef[] {
  if (!Array.isArray(raw)) return [];
  return (raw as unknown[]).filter(isFieldRef);
}

function isQueryTab(value: unknown): value is QueryTab {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.id === 'string' &&
    typeof obj.label === 'string' &&
    typeof obj.position === 'number' &&
    typeof obj.visibleToUser === 'boolean' &&
    Array.isArray(obj.fields)
  );
}

function parseTabs(raw: Prisma.JsonValue): QueryTab[] {
  if (!Array.isArray(raw)) return [];
  return (raw as unknown[])
    .filter(isQueryTab)
    .map((tab) => ({ ...tab, fields: parseFieldRefs(tab.fields as unknown as Prisma.JsonValue) }));
}

interface SavedQueryRow {
  id: string;
  name: string;
  jql: string;
  position: number;
  listColumns: Prisma.JsonValue;
  tabs: Prisma.JsonValue;
  autresVisibleToUser: boolean;
  createdAt: Date;
  updatedAt: Date;
}

function toRecord(row: SavedQueryRow): SavedQueryRecord {
  return {
    id: row.id,
    name: row.name,
    jql: row.jql,
    position: row.position,
    listColumns: parseFieldRefs(row.listColumns),
    tabs: parseTabs(row.tabs),
    autresVisibleToUser: row.autresVisibleToUser,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

// Le JQL n'est volontairement PAS validé ici (contrairement au nom) : la
// migration automatique v1→v2 doit pouvoir créer "Requête 1" avec un JQL
// vide plutôt que d'échouer si ni AppConfig.jql ni JIRA_JQL ne sont
// définis (voir legacyQueryMigration.ts). L'exigence "JQL non vide" pour
// les formulaires d'administration est appliquée au niveau de la route,
// pas du service.
function assertValidQueryInput(input: { name?: string }): void {
  if (input.name !== undefined && !input.name.trim()) {
    throw new Error('Le nom de la requête ne peut pas être vide');
  }
}

export async function listQueriesSummary(): Promise<SavedQuerySummary[]> {
  return prisma.savedQuery.findMany({
    orderBy: { position: 'asc' },
    select: { id: true, name: true, position: true },
  });
}

export async function listQueriesFull(): Promise<SavedQueryRecord[]> {
  const rows = await prisma.savedQuery.findMany({ orderBy: { position: 'asc' } });
  return rows.map(toRecord);
}

export async function getQueryById(id: string): Promise<SavedQueryRecord | null> {
  const row = await prisma.savedQuery.findUnique({ where: { id } });
  return row ? toRecord(row) : null;
}

export interface CreateQueryInput {
  name: string;
  jql: string;
  position?: number;
  listColumns?: FieldRef[];
  tabs?: QueryTab[];
  autresVisibleToUser?: boolean;
}

export async function createQuery(input: CreateQueryInput): Promise<SavedQueryRecord> {
  assertValidQueryInput(input);
  const row = await prisma.savedQuery.create({
    data: {
      name: input.name.trim(),
      jql: input.jql.trim(),
      position: input.position ?? 0,
      listColumns: (input.listColumns ?? []) as unknown as Prisma.InputJsonValue,
      tabs: (input.tabs ?? []) as unknown as Prisma.InputJsonValue,
      autresVisibleToUser: input.autresVisibleToUser ?? false,
    },
  });
  return toRecord(row);
}

export interface UpdateQueryInput {
  name?: string;
  jql?: string;
  position?: number;
  listColumns?: FieldRef[];
  tabs?: QueryTab[];
  autresVisibleToUser?: boolean;
}

export async function updateQuery(id: string, input: UpdateQueryInput): Promise<SavedQueryRecord> {
  assertValidQueryInput(input);
  const data: Prisma.SavedQueryUpdateInput = {};
  if (input.name !== undefined) data.name = input.name.trim();
  if (input.jql !== undefined) data.jql = input.jql.trim();
  if (input.position !== undefined) data.position = input.position;
  if (input.listColumns !== undefined) data.listColumns = input.listColumns as unknown as Prisma.InputJsonValue;
  if (input.tabs !== undefined) data.tabs = input.tabs as unknown as Prisma.InputJsonValue;
  if (input.autresVisibleToUser !== undefined) data.autresVisibleToUser = input.autresVisibleToUser;

  const row = await prisma.savedQuery.update({ where: { id }, data });
  return toRecord(row);
}

export async function deleteQuery(id: string): Promise<void> {
  await prisma.savedQuery.delete({ where: { id } });
}

export async function countQueries(): Promise<number> {
  return prisma.savedQuery.count();
}
