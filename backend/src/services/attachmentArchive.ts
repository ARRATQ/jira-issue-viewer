import archiver from 'archiver';
import { Readable } from 'node:stream';
import type { Writable } from 'node:stream';
import { isReporterAttachment } from '../lib/jira';
import type { JiraAttachmentMeta, JiraAttachmentStream } from '../lib/jira';

type Role = 'ADMIN' | 'USER';

// Nom de la colonne calculée du tableau (clé dans `extraFields` et
// `availableColumns`). Volontairement différent du nom du champ Jira natif
// ("Pièce jointe" / "Attachment") pour ne jamais entrer en collision.
export const ATTACHMENT_COUNT_COLUMN = 'Nombre de pièces jointes';

// Même règle que l'affichage du drawer : USER ne voit que les pièces jointes
// déposées par le rapporteur du ticket, ADMIN les voit toutes.
export function visibleAttachmentsFor(
  role: Role,
  attachments: readonly JiraAttachmentMeta[],
  reporterId: string | null,
): JiraAttachmentMeta[] {
  if (role === 'ADMIN') return [...attachments];
  return attachments.filter((a) => isReporterAttachment(a.authorId, reporterId));
}

// Neutralise les séparateurs de chemin et ".." pour qu'une entrée d'archive
// ne puisse pas s'extraire hors du dossier cible (zip slip).
function sanitizeEntryName(filename: string): string {
  const cleaned = filename
    .replace(/[\\/]/g, '_')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f]/g, '')
    .trim();
  if (cleaned === '' || cleaned === '.' || cleaned === '..') return 'piece-jointe';
  return cleaned;
}

function withSuffix(name: string, n: number): string {
  const dot = name.lastIndexOf('.');
  if (dot <= 0) return `${name} (${n})`;
  return `${name.slice(0, dot)} (${n})${name.slice(dot)}`;
}

// Jira autorise plusieurs pièces jointes de même nom sur un ticket : on
// suffixe les doublons ("rapport (2).pdf") pour ne rien écraser dans le zip.
export function uniqueEntryNames(filenames: readonly string[]): string[] {
  const used = new Set<string>();
  return filenames.map((raw) => {
    const base = sanitizeEntryName(raw);
    let candidate = base;
    for (let n = 2; used.has(candidate.toLowerCase()); n += 1) {
      candidate = withSuffix(base, n);
    }
    used.add(candidate.toLowerCase());
    return candidate;
  });
}

export function zipFileName(issueKey: string): string {
  return `${issueKey.replace(/[^A-Za-z0-9_-]/g, '_')}-pieces-jointes.zip`;
}

type OpenStream = (attachment: JiraAttachmentMeta) => Promise<JiraAttachmentStream>;

// Écrit l'archive en streaming dans `output`. Les pièces jointes sont
// récupérées une par une auprès de Jira : on n'ouvre pas N connexions
// simultanées et rien n'est chargé entièrement en mémoire.
export async function writeAttachmentsZip(
  attachments: readonly JiraAttachmentMeta[],
  openStream: OpenStream,
  output: Writable,
): Promise<void> {
  const archive = archiver('zip', { zlib: { level: 6 } });
  const failed = new Promise<never>((_, reject) => {
    archive.on('error', reject);
    archive.on('warning', reject);
  });
  failed.catch(() => undefined);
  archive.pipe(output);

  const names = uniqueEntryNames(attachments.map((a) => a.filename));
  try {
    for (const [index, attachment] of attachments.entries()) {
      const source = await openStream(attachment);
      const entryWritten = new Promise<void>((resolve) => archive.once('entry', () => resolve()));
      archive.append(Readable.fromWeb(source.body as never), { name: names[index]! });
      await Promise.race([entryWritten, failed]);
    }
    await Promise.race([archive.finalize(), failed]);
  } catch (err) {
    archive.abort();
    throw err;
  }
}
