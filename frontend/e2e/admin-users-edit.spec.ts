import { test, expect } from '@playwright/test';

// Même approche que les autres specs : /api/* est mocké au niveau réseau.
const ADMIN = { id: 'admin-1', email: 'admin@example.com', name: 'Admin', role: 'ADMIN' };

test.describe('parcours admin : édition d’un compte', () => {
  test('an admin edits a user profile and resets their password', async ({ page }) => {
    let jane = {
      id: 'u1',
      email: 'jane@example.com',
      name: 'Jane',
      role: 'USER',
      active: true,
      mustChangePassword: false,
      createdAt: '2026-01-01T00:00:00.000Z',
    };
    const patchBodies: unknown[] = [];

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
        body: JSON.stringify({ appName: 'jira-issue-viewer', logoDataUrl: null, confidentialityNotice: 'Mention.' }),
      });
    });
    await page.route('**/api/queries', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ queries: [] }) });
    });
    await page.route('**/api/admin/config', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ jiraUrl: 'https://jira.example.com', jql: '', tlsRejectUnauthorized: true, patConfigured: true }),
      });
    });
    await page.route('**/api/admin/users', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ users: [jane] }) });
    });
    await page.route('**/api/admin/users/u1', async (route) => {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      patchBodies.push(body);
      const { password, ...profile } = body;
      jane = { ...jane, ...profile, mustChangePassword: password ? true : jane.mustChangePassword };
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(jane) });
    });

    await page.goto('/login');
    await page.getByLabel('Email').fill('admin@example.com');
    await page.getByLabel('Mot de passe').fill('secret');
    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: 'Se connecter' }).click();

    await page.getByRole('link', { name: 'Administration' }).click();
    await page.getByRole('link', { name: 'Comptes' }).click();
    await page.getByRole('button', { name: 'Modifier jane@example.com' }).click();

    const dialog = page.getByRole('dialog', { name: 'Modifier le compte' });
    await expect(dialog).toBeVisible();

    // Réinitialisation du mot de passe : le panneau reste ouvert et confirme.
    await dialog.getByLabel('Nouveau mot de passe temporaire').fill('T3mp!Passw0rd');
    await dialog.getByRole('button', { name: 'Réinitialiser le mot de passe' }).click();
    await expect(dialog.getByText(/Mot de passe réinitialisé/)).toBeVisible();

    // Édition du profil : le panneau se ferme et la liste reflète le changement.
    await dialog.getByLabel('Email du compte').fill('jane.doe@example.com');
    await dialog.getByLabel('Nom du compte').fill('Jane Doe');
    await dialog.getByRole('button', { name: 'Enregistrer' }).click();

    await expect(dialog).not.toBeVisible();
    await expect(page.getByRole('cell', { name: 'jane.doe@example.com', exact: true })).toBeVisible();
    await expect(page.getByRole('cell', { name: 'Jane Doe', exact: true })).toBeVisible();

    expect(patchBodies).toEqual([
      { password: 'T3mp!Passw0rd' },
      { name: 'Jane Doe', email: 'jane.doe@example.com', role: 'USER' },
    ]);
  });
});
