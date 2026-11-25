import { createReadStream, createWriteStream } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable, type Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { JiraApiError, type JiraAttachmentMeta, type JiraAttachmentStream, type JiraClient } from '../lib/jira';
import { uniqueEntryNames, writeZip } from './attachmentArchive';

export { ZipAbortedError as ExportAbortedError } from './attachmentArchive';

// Export admin de toutes les pièces jointes d'une requête sauvegardée, destiné
// à être intégré dans une autre plateforme : un dossier par ticket et, à la
// racine, un manifeste CSV qui relie chaque fichier à la clé de son ticket.

export const MANIFEST_NAME = 'manifest.csv';

const SEPARATOR = ';';
const LINE_BREAK = '\r\n';
// BOM UTF-8 : même convention que l'export CSV du tableau, pour qu'Excel
// ouvre les accents correctement.
const BOM = '﻿';
const MANIFEST_HEADERS = [
  'cle_ticket',
  'nom_fichier',
  'chemin_dans_zip',
  'taille_octets',
  'type_mime',
  'statut',
  'erreur',
];
const NEEDS_QUOTES = /[";\r\n]/;

export interface IssueAttachments {
  key: string;
  attachments: readonly JiraAttachmentMeta[];
}

export interface ExportEntry {
  issueKey: string;
  attachment: JiraAttachmentMeta;
  /** Chemin de l'entrée dans l'archive : "<clé>/<nom de fichier>". */
  path: string;
}

// Un nom de dossier ne doit contenir ni séparateur ni ".." (zip slip). Les
// clés Jira (PROJ-123) passent inchangées.
function folderName(issueKey: string): string {
  return issueKey.replace(/[^A-Za-z0-9_-]/g, '_');
}

// Les noms sont dédoublonnés par ticket uniquement : deux tickets peuvent
// chacun contenir un "devis.pdf", ils sont dans des dossiers distincts.
export function planExport(issues: readonly IssueAttachments[]): ExportEntry[] {
  return issues.flatMap((issue) => {
    const folder = folderName(issue.key);
    const names = uniqueEntryNames(issue.attachments.map((a) => a.filename));
    return issue.attachments.map((attachment, index) => ({
      issueKey: issue.key,
      attachment,
      path: `${folder}/${names[index]!}`,
    }));
  });
}

// Les valeurs sont écrites telles quelles (pas de préfixe anti-formule comme
// dans l'export du tableau) : le manifeste est lu par une autre application,
// et les noms de fichier doivent correspondre exactement à ceux de l'archive.
function toCell(value: string): string {
  return NEEDS_QUOTES.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

// `failures` : id de pièce jointe → raison. Un fichier en échec n'est pas
// dans l'archive : son chemin est laissé vide et son statut vaut "erreur".
export function buildManifestCsv(
  entries: readonly ExportEntry[],
  failures: ReadonlyMap<string, string> = new Map(),
): string {
  const rows = entries.map((e) => {
    const failure = failures.get(e.attachment.id);
    return [
      e.issueKey,
      e.attachment.filename,
      failure === undefined ? e.path : '',
      String(e.attachment.size),
      e.attachment.mimeType,
      failure === undefined ? 'ok' : 'erreur',
      failure ?? '',
    ]
      .map(toCell)
      .join(SEPARATOR);
  });
  return BOM + [MANIFEST_HEADERS.join(SEPARATOR), ...rows].map((line) => line + LINE_BREAK).join('');
}

function formatLocalDate(date: Date): string {
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function exportZipFileName(queryName: string, date: Date = new Date()): string {
  const slug = queryName
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `pieces-jointes-${slug || 'export'}-${formatLocalDate(date)}.zip`;
}

// Métadonnées des pièces jointes demandées par petits lots parallèles : assez
// pour ne pas attendre ticket par ticket, sans surcharger l'instance Jira.
const METADATA_CONCURRENCY = 5;

export async function fetchIssueAttachments(
  client: Pick<JiraClient, 'getAttachmentsWithReporter'>,
  keys: readonly string[],
): Promise<IssueAttachments[]> {
  const results: IssueAttachments[] = [];
  for (let i = 0; i < keys.length; i += METADATA_CONCURRENCY) {
    const batch = await Promise.all(
      keys.slice(i, i + METADATA_CONCURRENCY).map(async (key) => ({
        key,
        attachments: (await client.getAttachmentsWithReporter(key)).attachments,
      })),
    );
    results.push(...batch);
  }
  return results;
}

type OpenStream = (attachment: JiraAttachmentMeta) => Promise<JiraAttachmentStream>;

export interface ExportFailure {
  issueKey: string;
  filename: string;
  reason: string;
}

export interface ExportResult {
  written: number;
  failed: ExportFailure[];
}

// Raison courte et sans donnée sensible (pas d'URL ni de corps de réponse).
function failureReason(err: unknown): string {
  if (err instanceof JiraApiError) return `HTTP ${err.status}`;
  return err instanceof Error ? err.message.slice(0, 200) : 'Erreur inconnue';
}

// Tentatives par fichier : Jira (ou son proxy) coupe parfois une connexion
// en plein transfert sur les gros volumes ("other side closed").
const MAX_ATTEMPTS = 3;
const DEFAULT_RETRY_DELAY_MS = 2_000;

// Erreur client de Jira (404 supprimé, 403 droits…) : réessayer ne servirait
// à rien. Coupures réseau, 5xx et 429 sont en revanche transitoires.
function isRetryable(err: unknown): boolean {
  if (err instanceof JiraApiError) return err.status >= 500 || err.status === 429;
  return true;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface WriteExportOptions {
  /** Délai de base entre deux tentatives (multiplié par le n° de tentative). */
  retryDelayMs?: number;
  /** Appelé pour chaque pièce jointe traitée (récupérée ou abandonnée). */
  onProgress?: (progress: { attachment: JiraAttachmentMeta; ok: boolean }) => void;
}

// Chaque pièce jointe est d'abord téléchargée entièrement depuis Jira dans un
// fichier temporaire, puis ajoutée à l'archive. Ainsi la connexion Jira n'est
// jamais ralentie par la vitesse du navigateur (elle restait sinon ouverte et
// inactive, jusqu'à être fermée par Jira), et une coupure peut être
// réessayée proprement : rien n'a encore été écrit dans le zip.
// Un fichier refusé définitivement est sauté et signalé dans le manifeste
// plutôt que de faire échouer tout l'export.
export async function writeExportZip(
  entries: readonly ExportEntry[],
  openStream: OpenStream,
  output: Writable,
  options: WriteExportOptions = {},
): Promise<ExportResult> {
  const retryDelayMs = options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;
  const tempDir = await mkdtemp(join(tmpdir(), 'jiv-export-'));
  let finished = false;

  const download = async (attachment: JiraAttachmentMeta, index: number): Promise<Readable> => {
    const path = join(tempDir, String(index));
    for (let attempt = 1; ; attempt += 1) {
      try {
        const source = await openStream(attachment);
        await pipeline(Readable.fromWeb(source.body as never), createWriteStream(path));
        options.onProgress?.({ attachment, ok: true });
        const local = createReadStream(path);
        local.once('close', () => void rm(path, { force: true }));
        return local;
      } catch (err) {
        await rm(path, { force: true });
        if (finished || !isRetryable(err) || attempt >= MAX_ATTEMPTS) throw err;
        await sleep(retryDelayMs * attempt);
      }
    }
  };

  const failures = new Map<string, string>();
  const failed: ExportFailure[] = [];
  // Les chemins sont uniques dans l'archive (planExport) : ils identifient l'entrée.
  const byPath = new Map(entries.map((e) => [e.path, e]));
  try {
    await writeZip(
      [
        ...entries.map((e, index) => ({
          name: e.path,
          open: () => download(e.attachment, index),
        })),
        {
          name: MANIFEST_NAME,
          content: () => buildManifestCsv(entries, failures),
        },
      ],
      output,
      {
        onOpenError: (zipEntry, err) => {
          const entry = byPath.get(zipEntry.name)!;
          const reason = failureReason(err);
          failures.set(entry.attachment.id, reason);
          options.onProgress?.({ attachment: entry.attachment, ok: false });
          failed.push({
            issueKey: entry.issueKey,
            filename: entry.attachment.filename,
            reason,
          });
        },
      },
    );
  } finally {
    // Stoppe les nouvelles tentatives d'un téléchargement encore en cours
    // (client parti) et supprime les fichiers temporaires restants.
    finished = true;
    await rm(tempDir, { recursive: true, force: true });
  }
  return { written: entries.length - failed.length, failed };
}
