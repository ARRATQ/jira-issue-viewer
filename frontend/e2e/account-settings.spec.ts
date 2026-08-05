import { test, expect } from '@playwright/test';

const USER = { id: 'u1', email: 'user@example.com', name: 'Jane Doe', role: 'USER' };

test.describe('confidentialité à la connexion + changement de mot de passe', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/branding', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          appName: 'jira-issue-viewer',
          logoDataUrl: null,
          confidentialityNotice: 'Mention de confidentialité de test.',
        }),
      });
    });

    await page.route('**/api/auth/login', async (route) => {
      const body = route.request().postDataJSON() as { acceptedConfidentiality?: boolean };
      if (body.acceptedConfidentiality !== true) {
        await route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Vous devez accepter la mention de confidentialité pour vous connecter' }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ accessToken: 'access-token', refreshToken: 'refresh-token', user: USER }),
      });
    });

    // La racine redirige vers la première requête ; une liste vide suffit ici,
    // ces parcours ne dépendent pas du contenu de la liste.
    await page.route('**/api/queries', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ queries: [] }),
      });
    });
  });

  test('the login button stays disabled until the confidentiality notice is accepted', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill('user@example.com');
    await page.getByLabel('Mot de passe').fill('secret');

    await expect(page.getByRole('button', { name: 'Se connecter' })).toBeDisabled();

    await page.getByRole('checkbox').check();
    await expect(page.getByRole('button', { name: 'Se connecter' })).toBeEnabled();
  });

  test('a user can change their own password from "Mon compte"', async ({ page }) => {
    await page.route('**/api/auth/password', async (route) => {
      const body = route.request().postDataJSON() as { currentPassword?: string; newPassword?: string };
      if (body.currentPassword !== 'Origin4l!Pass') {
        await route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Mot de passe actuel incorrect' }),
        });
        return;
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) });
    });

    await page.goto('/login');
    await page.getByLabel('Email').fill('user@example.com');
    await page.getByLabel('Mot de passe').fill('Origin4l!Pass');
    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: 'Se connecter' }).click();

    await page.getByRole('link', { name: 'Jane Doe' }).click();
    await expect(page.getByRole('heading', { name: 'Mon compte' })).toBeVisible();

    await page.getByLabel('Mot de passe actuel').fill('Origin4l!Pass');
    await page.getByLabel('Nouveau mot de passe', { exact: true }).fill('N3w!Password');
    await page.getByLabel('Confirmer le nouveau mot de passe').fill('N3w!Password');
    await page.getByRole('button', { name: 'Mettre à jour le mot de passe' }).click();

    await expect(page.getByText('Mot de passe mis à jour.')).toBeVisible();
  });
});
