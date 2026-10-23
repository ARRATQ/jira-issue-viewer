import { test, expect } from '@playwright/test';

// E2E "sans backend" : les appels /api/* sont interceptés au niveau réseau
// (page.route) pour ne dépendre ni d'un vrai backend, ni d'une base Postgres,
// ni d'un accès Jira réel — utile tant que ces dépendances externes ne sont
// pas disponibles dans l'environnement d'exécution (voir docs/planning).
const USER = { id: 'u1', email: 'user@example.com', name: 'Jane Doe', role: 'USER' };
const QUERY_ID = 'q1';

test.describe('login → navigation par requête → liste → détail → téléchargement', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/auth/login', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ accessToken: 'access-token', refreshToken: 'refresh-token', user: USER }),
      });
    });

    await page.route('**/api/branding', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ appName: 'jira-issue-viewer', logoDataUrl: null, confidentialityNotice: 'Mention de confidentialité de test.' }),
      });
    });

    // Navigation : une seule requête sauvegardée, vers laquelle la racine redirige.
    await page.route('**/api/queries', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ queries: [{ id: QUERY_ID, name: 'Requête 1', position: 0 }] }),
      });
    });

    await page.route(`**/api/queries/${QUERY_ID}/issues`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          queryId: QUERY_ID,
          queryName: 'Requête 1',
          jql: 'project = PROJ ORDER BY created DESC',
          listColumns: [],
          availableColumns: [{ fieldName: 'Raison Sociale' }],
          tabs: [{ id: 'infos', label: 'Infos', position: 0, visibleToUser: true, fields: [{ fieldName: 'Raison Sociale' }] }],
          autresVisibleToUser: false,
          issues: [
            {
              key: 'PROJ-1',
              summary: 'Cahier des charges initial',
              status: 'Open',
              issueType: 'Task',
              extraFields: { 'Raison Sociale': 'Solution X' },
            },
            {
              key: 'PROJ-2',
              summary: 'Recette',
              status: 'Done',
              issueType: 'Task',
              extraFields: { 'Raison Sociale': 'Globex' },
            },
          ],
        }),
      });
    });

    await page.route(`**/api/queries/${QUERY_ID}/issues/PROJ-1`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          key: 'PROJ-1',
          summary: 'Cahier des charges initial',
          status: 'Open',
          issueType: 'Task',
          fields: [{ id: 'customfield_10010', name: 'Raison Sociale', value: 'Solution X' }],
          attachments: [
            { id: '1001', filename: 'cahier-des-charges.pdf', mimeType: 'application/pdf', size: 12, contentUrl: 'ignored-by-frontend', authorId: 'rep1', authorName: 'Jane Doe' },
          ],
          // USER ne voit que les PJ déposées par le rapporteur : l'auteur de la
          // PJ ci-dessus correspond au rapporteur pour qu'elle reste visible.
          reporterId: 'rep1',
          reporterName: 'Jane Doe',
        }),
      });
    });

    await page.route(`**/api/queries/${QUERY_ID}/issues/PROJ-1/attachments/1001`, async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/pdf', body: Buffer.from('%PDF-1.4 fake-content') });
    });
  });

  test('logs in, lands on the query view, opens a ticket in the drawer, and downloads its attachment', async ({
    page,
  }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill('user@example.com');
    await page.getByLabel('Mot de passe').fill('secret');
    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: 'Se connecter' }).click();

    await expect(page.getByText('project = PROJ ORDER BY created DESC')).toBeVisible();

    await page.getByRole('button', { name: 'PROJ-1' }).click();

    const drawer = page.getByRole('dialog');
    await expect(drawer.getByRole('heading', { name: 'Cahier des charges initial' })).toBeVisible();

    // "Raison Sociale" fait partie de l'onglet "Infos", actif par défaut.
    await expect(drawer.getByText('Raison Sociale')).toBeVisible();
    await expect(drawer.getByText('Solution X')).toBeVisible();

    // Rôle USER : l'onglet "Autres" (autresVisibleToUser=false) doit être masqué.
    await expect(drawer.getByRole('button', { name: 'Autres' })).not.toBeVisible();

    const downloadPromise = page.waitForEvent('download');
    await drawer.getByRole('button', { name: 'Télécharger' }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe('cahier-des-charges.pdf');

    await drawer.getByRole('button', { name: 'Agrandir le panneau' }).click();
    await expect(drawer.getByRole('button', { name: 'Réduire le panneau' })).toBeVisible();

    await drawer.getByRole('button', { name: 'Fermer le panneau' }).click();
    // aria-hidden retire le drawer de l'arbre d'accessibilité : on vérifie
    // via un sélecteur CSS plutôt que getByRole, qui ne le trouverait plus.
    await expect(page.locator('.drawer-overlay')).toHaveAttribute('aria-hidden', 'true');
  });

  test('adds a column, filters, and exports the displayed table as CSV', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill('user@example.com');
    await page.getByLabel('Mot de passe').fill('secret');
    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: 'Se connecter' }).click();

    const table = page.getByRole('table');
    await expect(table.getByRole('button', { name: 'PROJ-2' })).toBeVisible();

    await page.getByRole('button', { name: /Colonnes/ }).click();
    await page.getByRole('checkbox', { name: 'Raison Sociale' }).check();
    await page.keyboard.press('Escape');
    await expect(table.getByRole('columnheader', { name: 'Raison Sociale' })).toBeVisible();

    await page.getByLabel('Statut').selectOption('Done');
    await expect(table.getByRole('button', { name: 'PROJ-1' })).not.toBeVisible();

    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Exporter CSV' }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^requete-1-\d{4}-\d{2}-\d{2}\.csv$/);

    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(chunk as Buffer);
    const lines = Buffer.concat(chunks).toString('utf-8').replace('\uFEFF', '').split('\r\n');
    expect(lines).toEqual(['Clé;Résumé;Statut;Type;Raison Sociale', 'PROJ-2;Recette;Done;Task;Globex']);

    // Le choix de colonnes survit au rechargement (préférence navigateur).
    await page.reload();
    await expect(page.getByRole('columnheader', { name: 'Raison Sociale' })).toBeVisible();
  });
});
