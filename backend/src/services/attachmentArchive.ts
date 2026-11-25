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

// Entrée d'archive : fichier distant streamé (pièce jointe) ou contenu texte
// produit par l'application (ex. manifeste CSV). Le contenu peut être
// calculé au moment de l'écriture, pour refléter les entrées précédentes.
export interface RemoteZipEntry {
  name: string;
  open: () => Promise<JiraAttachmentStream>;
}
export type ZipEntry = RemoteZipEntry | { name: string; content: string | (() => string) };

// Le client (navigateur ou proxy) a fermé la connexion avant la fin.
export class ZipAbortedError extends Error {
  constructor() {
    super('Connexion fermée par le client avant la fin de l\'archive');
    this.name = 'ZipAbortedError';
  }
}

export interface WriteZipOptions {
  // Si fourni, un fichier distant impossible à ouvrir est sauté (et signalé
  // ici) au lieu d'interrompre toute l'archive.
  onOpenError?: (entry: RemoteZipEntry, err: unknown) => void;
}

// Écrit l'archive en streaming dans `output`. Les fichiers distants sont
// récupérés un par un auprès de Jira : on n'ouvre pas N connexions
// simultanées et rien n'est chargé entièrement en mémoire.
export async function writeZip(
  entries: readonly ZipEntry[],
  output: Writable,
  options: WriteZipOptions = {},
): Promise<void> {
  const archive = archiver('zip', { zlib: { level: 6 } });
  let aborted = false;
  const failed = new Promise<never>((_, reject) => {
    archive.on('error', reject);
    archive.on('warning', reject);
    // Sans ça, une déconnexion laisserait la boucle attendre indéfiniment
    // un événement 'entry' qui ne viendra jamais, en continuant à solliciter Jira.
    const onGone = (): void => {
      if (output.writableFinished) return;
      aborted = true;
      reject(new ZipAbortedError());
    };
    output.once('close', onGone);
    output.on('error', onGone);
  });
  failed.catch(() => undefined);
  archive.pipe(output);

  try {
    for (const entry of entries) {
      if (aborted) throw new ZipAbortedError();
      let data: string | Readable;
      if ('open' in entry) {
        const opened = await Promise.race([
          entry.open().then(
            (stream) => ({ stream }),
            (error: unknown) => ({ error }),
          ),
          failed,
        ]);
        if ('error' in opened) {
          if (!options.onOpenError) throw opened.error;
          options.onOpenError(entry, opened.error);
          continue;
        }
        data = Readable.fromWeb(opened.stream.body as never);
      } else {
        data = typeof entry.content === 'function' ? entry.content() : entry.content;
      }
      const entryWritten = new Promise<void>((resolve) => archive.once('entry', () => resolve()));
      archive.append(data, { name: entry.name });
      await Promise.race([entryWritten, failed]);
    }
    await Promise.race([archive.finalize(), failed]);
  } catch (err) {
    archive.abort();
    throw err;
  }
}

export async function writeAttachmentsZip(
  attachments: readonly JiraAttachmentMeta[],
  openStream: OpenStream,
  output: Writable,
): Promise<void> {
  const names = uniqueEntryNames(attachments.map((a) => a.filename));
  await writeZip(
    attachments.map((attachment, index) => ({ name: names[index]!, open: () => openStream(attachment) })),
    output,
  );
}
