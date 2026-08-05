import { test, expect } from '@playwright/test';

// /api/* est mocké au niveau réseau pour rester indépendant d'un backend/DB/Jira.
// Depuis le passage aux requêtes multiples, le JQL n'est plus une config globale
// pilotant la liste (il est propre à chaque requête, cf. admin-queries.spec.ts) :
// ce parcours ne vérifie donc plus qu'un enregistrement de la config Jira aboutit.
const ADMIN = { id: 'admin-1', email: 'admin@example.com', name: 'Admin', role: 'ADMIN' };

test.describe('parcours admin : configuration Jira', () => {
  test('an admin can open the Jira config page and save it', async ({ page }) => {
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

    await page.route('**/api/queries', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ queries: [] }) });
    });

    await page.route('**/api/admin/config', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          jiraUrl: 'https://jira.example.com/jira',
          jql: '',
          tlsRejectUnauthorized: true,
          patConfigured: true,
        }),
      });
    });

    await page.goto('/login');
    await page.getByLabel('Email').fill('admin@example.com');
    await page.getByLabel('Mot de passe').fill('secret');
    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: 'Se connecter' }).click();

    await page.getByRole('link', { name: 'Administration' }).click();
    await expect(page.getByRole('heading', { name: 'Configuration Jira' })).toBeVisible();

    await page.getByLabel('URL Jira Data Center').fill('https://jira.example.com/jira2');
    await page.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(page.getByText('Configuration enregistrée.')).toBeVisible();
  });
});
