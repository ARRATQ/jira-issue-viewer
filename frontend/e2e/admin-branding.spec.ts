import { test, expect } from '@playwright/test';

// Même approche que les autres specs : /api/* est mocké au niveau réseau.
const ADMIN = { id: 'admin-1', email: 'admin@example.com', name: 'Admin', role: 'ADMIN' };

const TINY_PNG_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

test.describe('parcours admin : personnalisation (nom + logo)', () => {
  test('changing the app name updates the header, login page, and browser tab title', async ({ page }) => {
    let branding = { appName: 'jira-issue-viewer', logoDataUrl: null as string | null };

    await page.route('**/api/auth/login', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ accessToken: 'access-token', refreshToken: 'refresh-token', user: ADMIN }),
      });
    });

    await page.route('**/api/branding', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(branding) });
    });

    await page.route('**/api/admin/branding', async (route) => {
      const body = route.request().postDataJSON() as { appName?: string; logoDataUrl?: string | null };
      branding = {
        appName: body.appName ?? branding.appName,
        logoDataUrl: body.logoDataUrl !== undefined ? body.logoDataUrl : branding.logoDataUrl,
      };
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(branding) });
    });

    await page.route('**/api/admin/config', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          jiraUrl: 'https://jira.example.com/jira',
          jql: 'project = PROJ',
          tlsRejectUnauthorized: true,
          patConfigured: true,
        }),
      });
    });

    await page.route('**/api/issues', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ jql: 'project = PROJ', issues: [] }),
      });
    });

    await page.goto('/login');
    await expect(page.getByRole('heading', { name: 'jira-issue-viewer' })).toBeVisible();

    await page.getByLabel('Email').fill('admin@example.com');
    await page.getByLabel('Mot de passe').fill('secret');
    await page.getByRole('button', { name: 'Se connecter' }).click();

    await page.getByRole('link', { name: 'Administration' }).click();
    await expect(page.getByRole('heading', { name: 'Configuration Jira' })).toBeVisible();

    await page.getByRole('link', { name: 'Personnalisation' }).click();
    await expect(page.getByRole('heading', { name: 'Personnalisation' })).toBeVisible();

    const nameField = page.getByLabel('Nom de l’application');
    await nameField.fill('Maroc PME Portail');

    const fileChooserPromise = page.waitForEvent('filechooser');
    await page.getByLabel('Logo').click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles({
      name: 'logo.png',
      mimeType: 'image/png',
      buffer: Buffer.from(TINY_PNG_DATA_URL.split(',')[1] ?? '', 'base64'),
    });

    await page.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(page.getByText('Personnalisation enregistrée.')).toBeVisible();

    // Le nom personnalisé doit apparaître dans l'en-tête de l'app...
    await expect(page.locator('.app-header__brand')).toContainText('Maroc PME Portail');
    // ... et le logo doit y être affiché.
    await expect(page.locator('.app-header__logo')).toBeVisible();
    // ... ainsi que dans le titre de l'onglet navigateur.
    await expect(page).toHaveTitle('Maroc PME Portail');

    await page.getByRole('button', { name: 'Se déconnecter' }).click();
    await expect(page.getByRole('heading', { name: 'Maroc PME Portail' })).toBeVisible();
    await expect(page.locator('.login-card__logo')).toBeVisible();
  });
});
