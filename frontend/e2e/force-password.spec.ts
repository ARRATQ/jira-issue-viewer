import { test, expect } from '@playwright/test';

// Vérifie le parcours de mot de passe imposé : un compte marqué
// mustChangePassword est confiné à l'écran dédié tant qu'il n'a pas défini son
// propre mot de passe, puis accède à l'app.
const USER = { id: 'u1', email: 'temp@example.com', name: 'Temp User', role: 'USER', mustChangePassword: true };

test.describe('mot de passe imposé à la première connexion', () => {
  test('a temporary-password account must set a new password before entering the app', async ({ page }) => {
    await page.route('**/api/branding', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ appName: 'jira-issue-viewer', logoDataUrl: null, confidentialityNotice: 'Mention de confidentialité de test.' }),
      });
    });

    await page.route('**/api/auth/login', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ accessToken: 'access-token', refreshToken: 'refresh-token', user: USER }),
      });
    });

    await page.route('**/api/auth/password', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) });
    });

    await page.route('**/api/queries', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ queries: [] }) });
    });

    await page.goto('/login');
    await page.getByLabel('Email').fill('temp@example.com');
    await page.getByLabel('Mot de passe').fill('T3mp!Pass');
    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: 'Se connecter' }).click();

    // Confiné à l'écran de changement imposé.
    await expect(page.getByRole('heading', { name: 'Changement de mot de passe requis' })).toBeVisible();

    await page.getByLabel('Mot de passe temporaire').fill('T3mp!Pass');
    await page.getByLabel('Nouveau mot de passe', { exact: true }).fill('N3w!Password');
    await page.getByLabel('Confirmer le nouveau mot de passe').fill('N3w!Password');
    await page.getByRole('button', { name: 'Définir mon mot de passe' }).click();

    // Entré dans l'app : l'en-tête (donc le shell authentifié) est présent, et
    // l'écran imposé a disparu.
    await expect(page.getByRole('button', { name: 'Se déconnecter' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Changement de mot de passe requis' })).not.toBeVisible();
  });
});
