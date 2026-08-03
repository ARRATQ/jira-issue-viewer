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

const { setConfigValue, getConfigValue, getPublicConfig, getJiraClientConfig, getJql } = await import(
  '../src/services/config'
);

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

  it('getJql falls back to JIRA_JQL env var when unset in DB', async () => {
    process.env.JIRA_JQL = 'project = ENV_FALLBACK';
    expect(await getJql()).toBe('project = ENV_FALLBACK');
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
