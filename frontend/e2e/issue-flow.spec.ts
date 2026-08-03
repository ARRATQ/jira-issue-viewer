import { test, expect } from '@playwright/test';

// E2E "sans backend" : les appels /api/* sont interceptés au niveau réseau
// (page.route) pour ne dépendre ni d'un vrai backend, ni d'une base Postgres,
// ni d'un accès Jira réel — utile tant que ces dépendances externes ne sont
// pas disponibles dans l'environnement d'exécution (voir docs/planning).
const USER = { id: 'u1', email: 'user@example.com', name: 'Jane Doe', role: 'USER' };

test.describe('login → liste des issues → détail → téléchargement de pièce jointe', () => {
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
        body: JSON.stringify({ appName: 'jira-issue-viewer', logoDataUrl: null }),
      });
    });

    await page.route('**/api/issues', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          jql: 'project = PROJ ORDER BY created DESC',
          issues: [
            { key: 'PROJ-1', summary: 'Cahier des charges initial', status: 'Open', issueType: 'Task' },
          ],
        }),
      });
    });

    await page.route('**/api/issues/PROJ-1', async (route) => {
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
            {
              id: '1001',
              filename: 'cahier-des-charges.pdf',
              mimeType: 'application/pdf',
              size: 12,
              contentUrl: 'ignored-by-frontend',
            },
          ],
        }),
      });
    });

    await page.route('**/api/issues/PROJ-1/attachments/1001', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/pdf',
        body: Buffer.from('%PDF-1.4 fake-content'),
      });
    });
  });

  test('logs in, opens the issue list, opens a ticket in the drawer, and downloads its attachment', async ({
    page,
  }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill('user@example.com');
    await page.getByLabel('Mot de passe').fill('secret');
    await page.getByRole('button', { name: 'Se connecter' }).click();

    await expect(page.getByText('project = PROJ ORDER BY created DESC')).toBeVisible();

    await page.getByRole('button', { name: 'PROJ-1' }).click();

    const drawer = page.getByRole('dialog');
    await expect(drawer.getByRole('heading', { name: 'Cahier des charges initial' })).toBeVisible();

    // "Raison Sociale" fait partie de l'onglet "Infos", actif par défaut.
    await expect(drawer.getByText('Raison Sociale')).toBeVisible();
    await expect(drawer.getByText('Solution X')).toBeVisible();

    // Rôle USER : l'onglet "Autres" (champs non catégorisés) doit être masqué.
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
});
