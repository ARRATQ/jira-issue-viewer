import { prisma } from '../lib/prisma';
import { encrypt, decrypt } from '../lib/crypto';
import type { JiraConfig } from '../lib/jira';

const DEFAULT_TLS_REJECT_UNAUTHORIZED = true;

async function getRaw(key: string) {
  return prisma.appConfig.findUnique({ where: { key } });
}

export async function getConfigValue(key: string): Promise<string | null> {
  const row = await getRaw(key);
  if (!row) return null;
  return row.encrypted ? decrypt(row.value) : row.value;
}

export async function setConfigValue(
  key: string,
  value: string,
  options: { encrypted?: boolean } = {},
): Promise<void> {
  const encrypted = options.encrypted ?? false;
  const storedValue = encrypted ? encrypt(value) : value;
  await prisma.appConfig.upsert({
    where: { key },
    create: { key, value: storedValue, encrypted },
    update: { value: storedValue, encrypted },
  });
}

function parseBoolean(value: string | null, fallback: boolean): boolean {
  if (value === null) return fallback;
  return value === 'true';
}

export async function getJql(): Promise<string> {
  return (await getConfigValue('jql')) ?? process.env.JIRA_JQL ?? '';
}

export async function getJiraClientConfig(): Promise<JiraConfig> {
  const baseUrl = (await getConfigValue('jira_url')) ?? process.env.JIRA_URL;
  const pat = (await getConfigValue('jira_pat')) ?? process.env.JIRA_PAT;
  if (!baseUrl || !pat) {
    throw new Error('Connexion Jira non configurée (URL ou PAT manquant)');
  }
  const tlsEnv = (await getConfigValue('jira_tls_reject_unauthorized')) ?? process.env.JIRA_TLS_REJECT_UNAUTHORIZED ?? null;
  return {
    baseUrl,
    pat,
    tlsRejectUnauthorized: parseBoolean(tlsEnv, DEFAULT_TLS_REJECT_UNAUTHORIZED),
  };
}

export interface PublicConfig {
  jiraUrl: string | null;
  jql: string;
  tlsRejectUnauthorized: boolean;
  patConfigured: boolean;
}

// Vue "sûre" de la config : le PAT n'est jamais renvoyé, seule sa présence
// est signalée via `patConfigured`.
export async function getPublicConfig(): Promise<PublicConfig> {
  const jiraUrl = (await getConfigValue('jira_url')) ?? process.env.JIRA_URL ?? null;
  const jql = await getJql();
  const tlsEnv = (await getConfigValue('jira_tls_reject_unauthorized')) ?? process.env.JIRA_TLS_REJECT_UNAUTHORIZED ?? null;
  const tlsRejectUnauthorized = parseBoolean(tlsEnv, DEFAULT_TLS_REJECT_UNAUTHORIZED);
  const patRow = await getRaw('jira_pat');
  const patConfigured = Boolean(patRow) || Boolean(process.env.JIRA_PAT);
  return { jiraUrl, jql, tlsRejectUnauthorized, patConfigured };
}
