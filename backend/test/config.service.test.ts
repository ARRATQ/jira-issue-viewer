import { describe, expect, it, beforeAll, beforeEach, vi } from 'vitest';
import { createFakePrisma } from './helpers/fakePrisma';

const fakePrisma = createFakePrisma();

vi.mock('../src/lib/prisma', () => ({ prisma: fakePrisma }));

beforeAll(() => {
  process.env.ENCRYPTION_KEY = 'b'.repeat(64);
});

beforeEach(() => {
  fakePrisma.reset();
  delete process.env.JIRA_URL;
  delete process.env.JIRA_PAT;
  delete process.env.JIRA_JQL;
  delete process.env.JIRA_TLS_REJECT_UNAUTHORIZED;
});

const { setConfigValue, getConfigValue, getPublicConfig, getJiraClientConfig, getBranding, setBranding } =
  await import('../src/services/config');

describe('config service', () => {
  it('stores encrypted values so the raw DB row differs from the plain value', async () => {
    await setConfigValue('jira_pat', 'super-secret-pat', { encrypted: true });
    const row = fakePrisma.__state.configs.get('jira_pat');
    expect(row?.value).not.toBe('super-secret-pat');
    expect(await getConfigValue('jira_pat')).toBe('super-secret-pat');
  });

  it('stores non-encrypted values in plain text', async () => {
    await setConfigValue('jql', 'project = PROJ');
    const row = fakePrisma.__state.configs.get('jql');
    expect(row?.value).toBe('project = PROJ');
  });

  it('getPublicConfig never exposes the PAT value, only whether it is configured', async () => {
    await setConfigValue('jira_pat', 'super-secret-pat', { encrypted: true });
    const config = await getPublicConfig();
    expect(config.patConfigured).toBe(true);
    expect(JSON.stringify(config)).not.toContain('super-secret-pat');
  });

  it('getJiraClientConfig throws when neither DB nor env provide a URL/PAT', async () => {
    await expect(getJiraClientConfig()).rejects.toThrow(/non configurée/);
  });

  it('getJiraClientConfig prefers DB config over env vars', async () => {
    process.env.JIRA_URL = 'https://env.example.com';
    process.env.JIRA_PAT = 'env-pat';
    await setConfigValue('jira_url', 'https://db.example.com');
    await setConfigValue('jira_pat', 'db-pat', { encrypted: true });

    const config = await getJiraClientConfig();
    expect(config.baseUrl).toBe('https://db.example.com');
    expect(config.pat).toBe('db-pat');
  });

  it('tlsRejectUnauthorized defaults to true unless explicitly set to false', async () => {
    process.env.JIRA_URL = 'https://env.example.com';
    process.env.JIRA_PAT = 'env-pat';

    expect((await getJiraClientConfig()).tlsRejectUnauthorized).toBe(true);

    await setConfigValue('jira_tls_reject_unauthorized', 'false');
    expect((await getJiraClientConfig()).tlsRejectUnauthorized).toBe(false);
  });
});

const TINY_PNG_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

describe('branding service', () => {
  it('defaults the app name, logo, and confidentiality notice when nothing is configured', async () => {
    const branding = await getBranding();
    expect(branding.appName).toBe('jira-issue-viewer');
    expect(branding.logoDataUrl).toBeNull();
    expect(branding.confidentialityNotice.length).toBeGreaterThan(0);
  });

  it('updates the confidentiality notice and trims it', async () => {
    await setBranding({ confidentialityNotice: '  Merci de respecter la confidentialité.  ' });
    expect((await getBranding()).confidentialityNotice).toBe('Merci de respecter la confidentialité.');
  });

  it('rejects an empty confidentiality notice', async () => {
    await expect(setBranding({ confidentialityNotice: '   ' })).rejects.toThrow(/vide/);
  });

  it('updates the app name and trims it', async () => {
    await setBranding({ appName: '  Maroc PME Portail  ' });
    expect((await getBranding()).appName).toBe('Maroc PME Portail');
  });

  it('rejects an empty app name', async () => {
    await expect(setBranding({ appName: '   ' })).rejects.toThrow(/vide/);
  });

  it('stores and returns a valid logo data URL', async () => {
    await setBranding({ logoDataUrl: TINY_PNG_DATA_URL });
    expect((await getBranding()).logoDataUrl).toBe(TINY_PNG_DATA_URL);
  });

  it('rejects a logo that is not a data URL of an allowed image type', async () => {
    await expect(setBranding({ logoDataUrl: 'data:text/plain;base64,aGVsbG8=' })).rejects.toThrow(/invalide/);
    await expect(setBranding({ logoDataUrl: 'https://example.com/logo.png' })).rejects.toThrow(/invalide/);
  });

  it('rejects a logo larger than 500 KB', async () => {
    const oversizedBase64 = 'A'.repeat(Math.ceil((513 * 1024 * 4) / 3));
    await expect(setBranding({ logoDataUrl: `data:image/png;base64,${oversizedBase64}` })).rejects.toThrow(
      /dépasse la taille/,
    );
  });

  it('clears the logo when logoDataUrl is set to null', async () => {
    await setBranding({ logoDataUrl: TINY_PNG_DATA_URL });
    await setBranding({ logoDataUrl: null });
    expect((await getBranding()).logoDataUrl).toBeNull();
  });
});
