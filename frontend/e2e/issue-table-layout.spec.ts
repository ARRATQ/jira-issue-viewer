import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

// Lot 2 du tableau, vérifié dans un vrai navigateur : ce que jsdom ne sait
// pas rendre (sticky, largeurs mesurées, glisser-déposer HTML5).
const USER = { id: 'u1', email: 'user@example.com', name: 'Jane Doe', role: 'USER' };
const QUERY_ID = 'q1';

async function mockApi(page: Page): Promise<void> {
  const json = (body: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  await page.route('**/api/auth/login', (route) =>
    route.fulfill(json({ accessToken: 'access-token', refreshToken: 'refresh-token', user: USER })),
  );
  await page.route('**/api/branding', (route) =>
    route.fulfill(json({ appName: 'jira-issue-viewer', logoDataUrl: null, confidentialityNotice: 'Mention de test.' })),
  );
  await page.route('**/api/queries', (route) =>
    route.fulfill(json({ queries: [{ id: QUERY_ID, name: 'Requête 1', position: 0 }] })),
  );
  await page.route(`**/api/queries/${QUERY_ID}/issues`, (route) =>
    route.fulfill(
      json({
        queryId: QUERY_ID,
        queryName: 'Requête 1',
        jql: 'project = PROJ',
        listColumns: [{ fieldName: 'Profil Export' }, { fieldName: 'Raison Sociale' }],
        availableColumns: [{ fieldName: 'Profil Export' }, { fieldName: 'Raison Sociale' }],
        tabs: [],
        autresVisibleToUser: false,
        issues: Array.from({ length: 50 }, (_, i) => ({
          key: `PROJ-${i + 1}`,
          summary: `Ticket ${i + 1}`,
          status: 'Open',
          issueType: 'Task',
          extraFields: { 'Profil Export': i % 2 ? 'Avancé' : 'Débutant', 'Raison Sociale': `Entreprise ${i + 1}` },
        })),
      }),
    ),
  );
}

async function login(page: Page): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email').fill('user@example.com');
  await page.getByLabel('Mot de passe').fill('secret');
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page.getByRole('table')).toBeVisible();
}

function headerLabels(page: Page): Promise<string[]> {
  return page
    .locator('.issue-list__table thead .issue-list__sort')
    .evaluateAll((buttons) => buttons.map((b) => b.firstChild?.textContent ?? ''));
}

test.describe('tableau des issues : en-tête figé, largeurs, ordre des colonnes', () => {
  test.beforeEach(async ({ page }) => {
    await mockApi(page);
    await login(page);
  });

  test('keeps the header visible while the table scrolls', async ({ page }) => {
    await page.getByLabel('Par page').selectOption('50');
    const scroller = page.locator('.issue-list .table-scroll');
    const header = page.getByRole('columnheader', { name: /Résumé/ });
    const top = (await scroller.boundingBox())!.y;

    await scroller.evaluate((el) => el.scrollTo(0, 600));

    expect((await header.boundingBox())!.y).toBeCloseTo(top + 1, 0);
  });

  test('resizes a column with the mouse and restores it on double-click', async ({ page }) => {
    const header = page.getByRole('columnheader', { name: /Résumé/ });
    const handle = header.locator('.issue-list__resize');
    const box = (await handle.boundingBox())!;
    const before = (await header.boundingBox())!.width;

    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + 150, box.y + box.height / 2, { steps: 5 });
    await page.mouse.up();

    expect((await header.boundingBox())!.width).toBeGreaterThan(before + 100);
    await expect(header).not.toHaveAttribute('aria-sort');

    await handle.dblclick();
    // React vide la propriété mais laisse un attribut style="" : on lit la largeur.
    await expect.poll(() => header.evaluate((th) => th.style.width)).toBe('');
    expect((await header.boundingBox())!.width).toBeCloseTo(before, 0);
  });

  test('reorders dynamic columns by drag and drop and keeps the order after reload', async ({ page }) => {
    expect(await headerLabels(page)).toEqual(['Clé', 'Résumé', 'Statut', 'Type', 'Profil Export', 'Raison Sociale']);

    await page
      .getByRole('columnheader', { name: /Profil Export/ })
      .dragTo(page.getByRole('columnheader', { name: /Raison Sociale/ }));

    expect(await headerLabels(page)).toEqual(['Clé', 'Résumé', 'Statut', 'Type', 'Raison Sociale', 'Profil Export']);
    await page.reload();
    await expect(page.getByRole('table')).toBeVisible();
    expect(await headerLabels(page)).toEqual(['Clé', 'Résumé', 'Statut', 'Type', 'Raison Sociale', 'Profil Export']);
  });
});
