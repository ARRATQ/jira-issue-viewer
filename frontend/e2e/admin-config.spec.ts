import { test, expect } from '@playwright/test';

// Même approche que issue-flow.spec.ts : /api/* est mocké au niveau réseau
// pour rester indépendant d'un backend/DB/Jira réel.
const ADMIN = { id: 'admin-1', email: 'admin@example.com', name: 'Admin', role: 'ADMIN' };

test.describe("parcours admin : édition du JQL puis vérification de la liste", () => {
  test('editing the JQL in the admin config page changes what the issue list shows', async ({ page }) => {
    let currentJql = 'project = OLD ORDER BY created DESC';

    await page.route('**/api/auth/login', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ accessToken: 'access-token', refreshToken: 'refresh-token', user: ADMIN }),
      });
    });

    await page.route('**/api/admin/config', async (route) => {
      if (route.request().method() === 'PUT') {
        const body = route.request().postDataJSON() as { jql?: string };
        if (body.jql) currentJql = body.jql;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            jiraUrl: 'https://jira.example.com/jira',
            jql: currentJql,
            tlsRejectUnauthorized: true,
            patConfigured: true,
          }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          jiraUrl: 'https://jira.example.com/jira',
          jql: currentJql,
          tlsRejectUnauthorized: true,
          patConfigured: true,
        }),
      });
    });

    await page.route('**/api/issues', async (route) => {
      const issues =
        currentJql === 'project = OLD ORDER BY created DESC'
          ? [{ key: 'OLD-1', summary: 'Ancien ticket', status: 'Open', issueType: 'Task' }]
          : [{ key: 'NEW-1', summary: 'Nouveau ticket', status: 'Open', issueType: 'Task' }];
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ jql: currentJql, issues }),
      });
    });

    await page.goto('/login');
    await page.getByLabel('Email').fill('admin@example.com');
    await page.getByLabel('Mot de passe').fill('secret');
    await page.getByRole('button', { name: 'Se connecter' }).click();

    await expect(page.getByText('OLD-1')).toBeVisible();

    await page.getByRole('link', { name: 'Administration' }).click();
    await expect(page.getByRole('heading', { name: 'Configuration Jira' })).toBeVisible();

    const jqlField = page.getByLabel('Requête JQL globale');
    await jqlField.fill('project = NEW ORDER BY created DESC');
    await page.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(page.getByText('Configuration enregistrée.')).toBeVisible();

    await page.getByRole('link', { name: 'Issues' }).click();
    await expect(page.getByText('NEW-1')).toBeVisible();
    await expect(page.getByText('OLD-1')).not.toBeVisible();
  });
});
