import type { Writable } from 'node:stream';
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

// Un fichier que Jira refuse de servir (supprimé, droits, erreur réseau) est
// sauté et signalé dans le manifeste plutôt que de faire échouer tout
// l'export. Le manifeste est écrit en dernier pour refléter ces échecs.
export async function writeExportZip(
  entries: readonly ExportEntry[],
  openStream: OpenStream,
  output: Writable,
): Promise<ExportResult> {
  const failures = new Map<string, string>();
  const failed: ExportFailure[] = [];
  // Les chemins sont uniques dans l'archive (planExport) : ils identifient l'entrée.
  const byPath = new Map(entries.map((e) => [e.path, e]));
  await writeZip(
    [
      ...entries.map((e) => ({ name: e.path, open: () => openStream(e.attachment) })),
      { name: MANIFEST_NAME, content: () => buildManifestCsv(entries, failures) },
    ],
    output,
    {
      onOpenError: (zipEntry, err) => {
        const entry = byPath.get(zipEntry.name)!;
        const reason = failureReason(err);
        failures.set(entry.attachment.id, reason);
        failed.push({ issueKey: entry.issueKey, filename: entry.attachment.filename, reason });
      },
    },
  );
  return { written: entries.length - failed.length, failed };
}
