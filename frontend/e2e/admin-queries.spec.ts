import { test, expect } from '@playwright/test';

// Parcours d'administration des requêtes, mocké au niveau réseau avec un petit
// magasin en mémoire : un admin crée une requête, y configure un onglet custom,
// puis vérifie que cet onglet apparaît dans le drawer de détail de la requête.
const ADMIN = { id: 'admin-1', email: 'admin@example.com', name: 'Admin', role: 'ADMIN' };

interface StoredQuery {
  id: string;
  name: string;
  jql: string;
  position: number;
  listColumns: Array<{ fieldName: string; fieldId?: string }>;
  tabs: Array<{ id: string; label: string; position: number; visibleToUser: boolean; fields: Array<{ fieldName: string; fieldId?: string }> }>;
  autresVisibleToUser: boolean;
  createdAt: string;
  updatedAt: string;
}

test.describe('parcours admin : création d’une requête + onglet custom dans le drawer', () => {
  test('creates a query, configures a custom tab, and sees it in the detail drawer', async ({ page }) => {
    const now = '2026-08-05T00:00:00.000Z';
    const store: StoredQuery[] = [
      { id: 'q1', name: 'Requête 1', jql: 'project = A', position: 0, listColumns: [], tabs: [], autresVisibleToUser: false, createdAt: now, updatedAt: now },
    ];

    await page.route('**/api/auth/login', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ accessToken: 'access-token', refreshToken: 'refresh-token', user: ADMIN }),
      });
    });

    await page.route('**/api/branding', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ appName: 'jira-issue-viewer', logoDataUrl: null, confidentialityNotice: 'Mention de confidentialité de test.' }),
      });
    });

    // Résumé de navigation (tous rôles).
    await page.route('**/api/queries', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ queries: store.map((q) => ({ id: q.id, name: q.name, position: q.position })) }),
      });
    });

    // Liste + config (onglets) d'une requête donnée.
    await page.route('**/api/queries/*/issues', async (route) => {
      const id = new URL(route.request().url()).pathname.split('/')[3]!;
      const q = store.find((s) => s.id === id);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          queryId: id,
          queryName: q?.name ?? '',
          jql: q?.jql ?? '',
          listColumns: q?.listColumns ?? [],
          tabs: q?.tabs ?? [],
          autresVisibleToUser: q?.autresVisibleToUser ?? false,
          issues: q?.jql ? [{ key: 'PROJ-1', summary: 'Ticket un', status: 'Open', issueType: 'Task', extraFields: {} }] : [],
        }),
      });
    });

    await page.route('**/api/queries/*/issues/PROJ-1', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          key: 'PROJ-1',
          summary: 'Ticket un',
          status: 'Open',
          issueType: 'Task',
          fields: [{ id: 'customfield_20001', name: 'Statut Juridique', value: 'SARL' }],
          attachments: [],
          reporterId: null,
          reporterName: null,
        }),
      });
    });

    // Endpoints d'administration.
    await page.route('**/api/admin/queries', async (route) => {
      if (route.request().method() === 'POST') {
        const body = route.request().postDataJSON() as { name: string; jql: string; position?: number };
        const created: StoredQuery = {
          id: 'q2',
          name: body.name,
          jql: body.jql,
          position: body.position ?? store.length,
          listColumns: [],
          tabs: [],
          autresVisibleToUser: false,
          createdAt: now,
          updatedAt: now,
        };
        store.push(created);
        await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(created) });
        return;
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ queries: store }) });
    });

    await page.route('**/api/admin/queries/*', async (route) => {
      const id = new URL(route.request().url()).pathname.split('/').pop()!;
      const q = store.find((s) => s.id === id)!;
      if (route.request().method() === 'PUT') {
        const body = route.request().postDataJSON() as Partial<StoredQuery>;
        Object.assign(q, body);
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(q) });
        return;
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(q) });
    });

    // L'index /admin redirige vers la page de config : elle doit répondre pour
    // que le sous-menu d'administration s'affiche de façon stable.
    await page.route('**/api/admin/config', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ jiraUrl: '', jql: '', tlsRejectUnauthorized: true, patConfigured: false }),
      });
    });

    await page.route('**/api/admin/jira-fields', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          fields: [
            { id: 'customfield_20001', name: 'Statut Juridique' },
            { id: 'customfield_20002', name: 'Raison Sociale' },
          ],
        }),
      });
    });

    // --- Connexion puis navigation vers l'admin des requêtes ---
    await page.goto('/login');
    await page.getByLabel('Email').fill('admin@example.com');
    await page.getByLabel('Mot de passe').fill('secret');
    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: 'Se connecter' }).click();

    await page.getByRole('link', { name: 'Administration' }).click();
    // Laisse la redirection /admin → /admin/config s'établir avant de cliquer
    // sur le sous-onglet (sinon le lien est détaché pendant le rendu).
    await expect(page.getByRole('heading', { name: 'Configuration Jira' })).toBeVisible();
    await page.getByRole('link', { name: 'Requêtes' }).click();
    await expect(page.getByRole('heading', { name: 'Requêtes' })).toBeVisible();
    await expect(page.getByRole('cell', { name: 'Requête 1', exact: true })).toBeVisible();

    // --- Création d'une requête ---
    await page.getByLabel('Nom').fill('Vue Export');
    await page.getByLabel('Requête JQL').fill('project = EXP');
    await page.getByRole('button', { name: 'Créer la requête' }).click();
    await expect(page.getByRole('cell', { name: 'Vue Export', exact: true })).toBeVisible();

    // --- Édition : ajout d'un onglet custom "Juridique" avec un champ ---
    await page.getByRole('row', { name: /Vue Export/ }).getByRole('link', { name: 'Éditer' }).click();
    await expect(page.getByRole('heading', { name: /Éditer/ })).toBeVisible();

    await page.getByRole('button', { name: '+ Ajouter un onglet' }).click();
    const tabEditor = page.locator('.tab-editor');
    await tabEditor.getByRole('textbox').fill('Juridique');
    await tabEditor.getByRole('combobox').fill('juridique');
    await tabEditor.getByRole('button', { name: 'Statut Juridique' }).click();

    await page.getByRole('button', { name: 'Enregistrer' }).click();

    // Retour à la liste des requêtes après enregistrement.
    await expect(page.getByRole('heading', { name: 'Requêtes' })).toBeVisible();

    // --- Vérification : l'onglet custom apparaît dans le drawer de la requête ---
    await page.getByRole('link', { name: 'Vue Export' }).click();
    await page.getByRole('button', { name: 'PROJ-1' }).click();

    const drawer = page.getByRole('dialog');
    const juridiqueTab = drawer.getByRole('button', { name: 'Juridique' });
    await expect(juridiqueTab).toBeVisible();
    await juridiqueTab.click();
    await expect(drawer.getByText('Statut Juridique')).toBeVisible();
    await expect(drawer.getByText('SARL')).toBeVisible();
  });
});
