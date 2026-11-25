import type { Writable } from 'node:stream';
import type { JiraAttachmentMeta, JiraAttachmentStream } from '../lib/jira';
import { uniqueEntryNames, writeZip } from './attachmentArchive';

// Export admin de toutes les pièces jointes d'une requête sauvegardée, destiné
// à être intégré dans une autre plateforme : un dossier par ticket et, à la
// racine, un manifeste CSV qui relie chaque fichier à la clé de son ticket.

export const MANIFEST_NAME = 'manifest.csv';

const SEPARATOR = ';';
const LINE_BREAK = '\r\n';
// BOM UTF-8 : même convention que l'export CSV du tableau, pour qu'Excel
// ouvre les accents correctement.
const BOM = '﻿';
const MANIFEST_HEADERS = ['cle_ticket', 'nom_fichier', 'chemin_dans_zip', 'taille_octets', 'type_mime'];
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

export function buildManifestCsv(entries: readonly ExportEntry[]): string {
  const rows = entries.map((e) =>
    [e.issueKey, e.attachment.filename, e.path, String(e.attachment.size), e.attachment.mimeType]
      .map(toCell)
      .join(SEPARATOR),
  );
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

type OpenStream = (attachment: JiraAttachmentMeta) => Promise<JiraAttachmentStream>;

// Le manifeste est écrit en dernier : il n'apparaît que si tous les fichiers
// ont bien été ajoutés, l'archive étant interrompue à la première erreur.
export async function writeExportZip(
  entries: readonly ExportEntry[],
  openStream: OpenStream,
  output: Writable,
): Promise<void> {
  await writeZip(
    [
      ...entries.map((e) => ({ name: e.path, open: () => openStream(e.attachment) })),
      { name: MANIFEST_NAME, content: buildManifestCsv(entries) },
    ],
    output,
  );
}
