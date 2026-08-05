import { describe, expect, it, beforeEach, vi } from 'vitest';
import { createFakePrisma } from './helpers/fakePrisma';

const fakePrisma = createFakePrisma();
vi.mock('../src/lib/prisma', () => ({ prisma: fakePrisma }));

beforeEach(() => {
  fakePrisma.reset();
  delete process.env.JIRA_JQL;
});

const { migrateLegacyQueryIfNeeded } = await import('../src/services/legacyQueryMigration');
const { listQueriesFull } = await import('../src/services/savedQueries');
const { setConfigValue } = await import('../src/services/config');

describe('migrateLegacyQueryIfNeeded', () => {
  it('creates "Requête 1" from AppConfig.jql with the 5 legacy tabs and 2 list columns', async () => {
    await setConfigValue('jql', 'project = PROJ ORDER BY created DESC');

    await migrateLegacyQueryIfNeeded();

    const queries = await listQueriesFull();
    expect(queries).toHaveLength(1);
    const [query] = queries;
    expect(query?.name).toBe('Requête 1');
    expect(query?.jql).toBe('project = PROJ ORDER BY created DESC');
    expect(query?.listColumns.map((f) => f.fieldName)).toEqual(['Profil Export', 'Offre Export']);
    expect(query?.tabs.map((t) => t.id)).toEqual(['infos', 'contact', 'activites', 'besoin', 'realisation']);

    const realisation = query?.tabs.find((t) => t.id === 'realisation');
    expect(realisation?.visibleToUser).toBe(false);
    const infos = query?.tabs.find((t) => t.id === 'infos');
    expect(infos?.visibleToUser).toBe(true);
    expect(query?.autresVisibleToUser).toBe(false);
  });

  it('falls back to the JIRA_JQL env var when AppConfig.jql is unset', async () => {
    process.env.JIRA_JQL = 'project = ENV_FALLBACK';

    await migrateLegacyQueryIfNeeded();

    const [query] = await listQueriesFull();
    expect(query?.jql).toBe('project = ENV_FALLBACK');
  });

  it('creates the query with an empty JQL rather than failing when neither source is set', async () => {
    await expect(migrateLegacyQueryIfNeeded()).resolves.toBeUndefined();
    const [query] = await listQueriesFull();
    expect(query?.jql).toBe('');
  });

  it('does nothing if a query already exists (idempotent)', async () => {
    await migrateLegacyQueryIfNeeded();
    await migrateLegacyQueryIfNeeded();
    expect(await listQueriesFull()).toHaveLength(1);
  });
});
