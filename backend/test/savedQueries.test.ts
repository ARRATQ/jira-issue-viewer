import { describe, expect, it, beforeEach, vi } from 'vitest';
import { createFakePrisma } from './helpers/fakePrisma';

const fakePrisma = createFakePrisma();
vi.mock('../src/lib/prisma', () => ({ prisma: fakePrisma }));

beforeEach(() => {
  fakePrisma.reset();
});

const { createQuery, updateQuery, deleteQuery, getQueryById, listQueriesSummary, listQueriesFull, countQueries } =
  await import('../src/services/savedQueries');

describe('savedQueries service', () => {
  it('creates a query with defaults and returns it fully parsed', async () => {
    const query = await createQuery({ name: '  Requête export  ', jql: 'project = EXP' });

    expect(query.name).toBe('Requête export');
    expect(query.jql).toBe('project = EXP');
    expect(query.position).toBe(0);
    expect(query.listColumns).toEqual([]);
    expect(query.tabs).toEqual([]);
    expect(query.autresVisibleToUser).toBe(false);
  });

  it('rejects an empty name', async () => {
    await expect(createQuery({ name: '   ', jql: 'project = X' })).rejects.toThrow(/nom/i);
  });

  it('allows an empty JQL at the service level (enforced at the admin route level instead)', async () => {
    // Nécessaire pour la migration legacy : voir legacyQueryMigration.ts.
    await expect(createQuery({ name: 'Requête 1', jql: '' })).resolves.toMatchObject({ jql: '' });
  });

  it('stores and round-trips listColumns and tabs', async () => {
    const query = await createQuery({
      name: 'Requête export',
      jql: 'project = EXP',
      listColumns: [{ fieldName: 'Profil Export', fieldId: 'customfield_10020' }],
      tabs: [
        {
          id: 'infos',
          label: 'Infos',
          position: 0,
          visibleToUser: true,
          fields: [{ fieldName: 'Raison Sociale' }],
        },
      ],
      autresVisibleToUser: true,
    });

    const reloaded = await getQueryById(query.id);
    expect(reloaded?.listColumns).toEqual([{ fieldName: 'Profil Export', fieldId: 'customfield_10020' }]);
    expect(reloaded?.tabs).toEqual([
      { id: 'infos', label: 'Infos', position: 0, visibleToUser: true, fields: [{ fieldName: 'Raison Sociale' }] },
    ]);
    expect(reloaded?.autresVisibleToUser).toBe(true);
  });

  it('updates only the provided fields', async () => {
    const query = await createQuery({ name: 'Original', jql: 'project = A' });
    const updated = await updateQuery(query.id, { name: 'Renamed' });

    expect(updated.name).toBe('Renamed');
    expect(updated.jql).toBe('project = A');
  });

  it('deletes a query', async () => {
    const query = await createQuery({ name: 'To delete', jql: 'project = A' });
    await deleteQuery(query.id);
    expect(await getQueryById(query.id)).toBeNull();
  });

  it('lists summaries and full records ordered by position', async () => {
    await createQuery({ name: 'Second', jql: 'project = B', position: 1 });
    await createQuery({ name: 'First', jql: 'project = A', position: 0 });

    const summaries = await listQueriesSummary();
    expect(summaries.map((q) => q.name)).toEqual(['First', 'Second']);

    const full = await listQueriesFull();
    expect(full.map((q) => q.name)).toEqual(['First', 'Second']);
  });

  it('counts queries', async () => {
    expect(await countQueries()).toBe(0);
    await createQuery({ name: 'A', jql: 'project = A' });
    expect(await countQueries()).toBe(1);
  });
});
