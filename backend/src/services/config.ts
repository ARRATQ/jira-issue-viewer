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

// --- Personnalisation (nom de l'application + logo) ---

const DEFAULT_APP_NAME = 'jira-issue-viewer';
const MAX_LOGO_BYTES = 512 * 1024;
const LOGO_DATA_URL_RE = /^data:image\/(png|jpeg|jpg|webp|svg\+xml);base64,([A-Za-z0-9+/]+=*)$/;
const DEFAULT_CONFIDENTIALITY_NOTICE =
  'En vous connectant, vous vous engagez à respecter la confidentialité des informations Jira consultées via cette plateforme et à ne pas les divulguer à des tiers non autorisés.';

export interface Branding {
  appName: string;
  logoDataUrl: string | null;
  confidentialityNotice: string;
}

export async function getBranding(): Promise<Branding> {
  const appName = (await getConfigValue('app_name')) ?? DEFAULT_APP_NAME;
  const logoDataUrl = (await getConfigValue('app_logo')) || null;
  const confidentialityNotice = (await getConfigValue('confidentiality_notice')) ?? DEFAULT_CONFIDENTIALITY_NOTICE;
  return { appName, logoDataUrl, confidentialityNotice };
}

function assertValidLogoDataUrl(logoDataUrl: string): void {
  const match = LOGO_DATA_URL_RE.exec(logoDataUrl);
  if (!match) {
    throw new Error('Format de logo invalide (PNG, JPEG, WebP ou SVG attendu)');
  }
  const base64Body = match[2] ?? '';
  const approxBytes = (base64Body.length * 3) / 4;
  if (approxBytes > MAX_LOGO_BYTES) {
    throw new Error('Le logo dépasse la taille maximale autorisée (500 Ko)');
  }
}

export interface UpdateBrandingInput {
  appName?: string;
  logoDataUrl?: string | null;
  confidentialityNotice?: string;
}

export async function setBranding(input: UpdateBrandingInput): Promise<void> {
  if (input.appName !== undefined) {
    const trimmed = input.appName.trim();
    if (!trimmed) throw new Error("Le nom de l'application ne peut pas être vide");
    await setConfigValue('app_name', trimmed);
  }
  if (input.logoDataUrl !== undefined) {
    if (input.logoDataUrl === null) {
      await setConfigValue('app_logo', '');
    } else {
      assertValidLogoDataUrl(input.logoDataUrl);
      await setConfigValue('app_logo', input.logoDataUrl);
    }
  }
  if (input.confidentialityNotice !== undefined) {
    const trimmed = input.confidentialityNotice.trim();
    if (!trimmed) throw new Error('La mention de confidentialité ne peut pas être vide');
    await setConfigValue('confidentiality_notice', trimmed);
  }
}
