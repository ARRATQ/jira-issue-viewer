import { randomBytes, randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, readdir, rename, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { finished } from 'node:stream/promises';
import type { JiraAttachmentMeta, JiraAttachmentStream } from '../lib/jira';
import { exportZipFileName, writeExportZip, type ExportEntry } from './attachmentExport';

// Export des pièces jointes en tâche de fond.
//
// Une archive de plusieurs Go ne passe pas en un seul flux HTTP : un proxy ou
// le navigateur finit par couper la connexion (constaté en production après
// ~300 s). Le serveur construit donc d'abord le zip sur son disque, en
// exposant la progression ; l'admin télécharge ensuite un fichier fini, de
// taille connue et reprenable (requêtes Range), via une URL à jeton.
//
// État en mémoire (backend unique) : un redémarrage perd les tâches, et le
// dossier d'export est alors vidé au démarrage (resetExportDir).

export type ExportJobStatus = 'preparing' | 'running' | 'done' | 'failed';

export interface ExportJob {
  id: string;
  userId: string;
  queryId: string;
  queryName: string;
  jql: string;
  status: ExportJobStatus;
  totalFiles: number;
  totalBytes: number;
  doneFiles: number;
  failedFiles: number;
  processedBytes: number;
  zipBytes: number | null;
  fileName: string;
  filePath: string | null;
  downloadToken: string | null;
  error: string | null;
  createdAt: Date;
  finishedAt: Date | null;
}

// Vue renvoyée au frontend : ni chemin serveur ni jeton brut.
export interface ExportJobView {
  id: string;
  queryId: string;
  queryName: string;
  status: ExportJobStatus;
  totalFiles: number;
  totalBytes: number;
  doneFiles: number;
  failedFiles: number;
  processedBytes: number;
  zipBytes: number | null;
  error: string | null;
  createdAt: string;
  finishedAt: string | null;
  downloadUrl: string | null;
}

export class ExportBusyError extends Error {
  constructor() {
    super('Un export est déjà en cours : attendez sa fin ou annulez-le.');
    this.name = 'ExportBusyError';
  }
}

export const EXPORT_RETENTION_MS = 24 * 3_600_000;
const SWEEP_INTERVAL_MS = 3_600_000;

export function exportDir(): string {
  return process.env.EXPORT_DIR ?? join(tmpdir(), 'jiv-exports');
}

interface JobRuntime {
  job: ExportJob;
  completion: Promise<void>;
  cancelled: boolean;
  abort: (() => void) | null;
}

const jobs = new Map<string, JobRuntime>();

export interface StartExportParams {
  userId: string;
  queryId: string;
  queryName: string;
  jql: string;
  /** Métadonnées Jira (lent sur une grosse requête) : chargées dans la tâche. */
  loadEntries: () => Promise<readonly ExportEntry[]>;
  openStream: (attachment: JiraAttachmentMeta) => Promise<JiraAttachmentStream>;
  retryDelayMs?: number;
}

function isActive(job: ExportJob): boolean {
  return job.status === 'preparing' || job.status === 'running';
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message.slice(0, 300) : 'Erreur inconnue';
}

async function removeJob(id: string): Promise<void> {
  const runtime = jobs.get(id);
  jobs.delete(id);
  await rm(join(exportDir(), `${id}.zip`), { force: true });
  await rm(join(exportDir(), `${id}.zip.part`), { force: true });
  if (runtime?.job.filePath) await rm(runtime.job.filePath, { force: true });
}

async function runJob(runtime: JobRuntime, params: StartExportParams): Promise<void> {
  const { job } = runtime;
  const partPath = join(exportDir(), `${job.id}.zip.part`);
  try {
    const entries = await params.loadEntries();
    if (runtime.cancelled) return;
    job.totalFiles = entries.length;
    job.totalBytes = entries.reduce((sum, e) => sum + e.attachment.size, 0);
    job.status = 'running';

    await mkdir(exportDir(), { recursive: true });
    const output = createWriteStream(partPath);
    runtime.abort = () => output.destroy();
    const result = await writeExportZip(entries, params.openStream, output, {
      retryDelayMs: params.retryDelayMs,
      onProgress: ({ attachment, ok }) => {
        if (ok) job.doneFiles += 1;
        else job.failedFiles += 1;
        job.processedBytes += attachment.size;
      },
    });
    await finished(output);

    const finalPath = join(exportDir(), `${job.id}.zip`);
    await rename(partPath, finalPath);
    job.filePath = finalPath;
    job.zipBytes = (await stat(finalPath)).size;
    job.failedFiles = result.failed.length;
    job.downloadToken = randomBytes(32).toString('base64url');
    job.status = 'done';
    // eslint-disable-next-line no-console
    console.info(
      `[attachments-export] job=${job.id} terminé : ${result.written} fichiers, ${result.failed.length} en échec, zip ${job.zipBytes} octets`,
    );
    for (const f of result.failed) {
      // eslint-disable-next-line no-console
      console.warn(`[attachments-export] job=${job.id} fichier ignoré ${f.issueKey}/${f.filename} : ${f.reason}`);
    }
  } catch (err) {
    await rm(partPath, { force: true });
    if (runtime.cancelled) return;
    job.status = 'failed';
    job.error = errorMessage(err);
    console.error(`[attachments-export] job=${job.id} échec :`, err);
  } finally {
    runtime.abort = null;
    job.finishedAt = new Date();
  }
}

export function startExportJob(params: StartExportParams): ExportJob {
  // Une seule tâche à la fois : protège l'instance Jira et le disque.
  if ([...jobs.values()].some((r) => isActive(r.job))) throw new ExportBusyError();

  // Un nouvel export d'une requête remplace le précédent (et son fichier).
  for (const runtime of [...jobs.values()]) {
    if (runtime.job.queryId === params.queryId) void removeJob(runtime.job.id);
  }

  const job: ExportJob = {
    id: randomUUID(),
    userId: params.userId,
    queryId: params.queryId,
    queryName: params.queryName,
    jql: params.jql,
    status: 'preparing',
    totalFiles: 0,
    totalBytes: 0,
    doneFiles: 0,
    failedFiles: 0,
    processedBytes: 0,
    zipBytes: null,
    fileName: exportZipFileName(params.queryName),
    filePath: null,
    downloadToken: null,
    error: null,
    createdAt: new Date(),
    finishedAt: null,
  };
  const runtime: JobRuntime = { job, completion: Promise.resolve(), cancelled: false, abort: null };
  runtime.completion = runJob(runtime, params);
  jobs.set(job.id, runtime);
  return job;
}

export function getExportJob(id: string): ExportJob | undefined {
  return jobs.get(id)?.job;
}

export function listExportJobs(): ExportJob[] {
  return [...jobs.values()].map((r) => r.job);
}

export function findJobByDownloadToken(token: string): ExportJob | undefined {
  return listExportJobs().find((j) => j.status === 'done' && j.downloadToken === token);
}

export function jobCompletion(id: string): Promise<void> {
  return jobs.get(id)?.completion ?? Promise.resolve();
}

export function toJobView(job: ExportJob): ExportJobView {
  return {
    id: job.id,
    queryId: job.queryId,
    queryName: job.queryName,
    status: job.status,
    totalFiles: job.totalFiles,
    totalBytes: job.totalBytes,
    doneFiles: job.doneFiles,
    failedFiles: job.failedFiles,
    processedBytes: job.processedBytes,
    zipBytes: job.zipBytes,
    error: job.error,
    createdAt: job.createdAt.toISOString(),
    finishedAt: job.finishedAt?.toISOString() ?? null,
    downloadUrl: job.downloadToken ? `/api/downloads/attachments-export/${job.downloadToken}` : null,
  };
}

// Annule une tâche en cours (ou supprime une tâche terminée) et ses fichiers.
export async function cancelExportJob(id: string): Promise<boolean> {
  const runtime = jobs.get(id);
  if (!runtime) return false;
  runtime.cancelled = true;
  // Pendant la préparation, rien n'est encore écrit : inutile d'attendre la
  // fin des appels Jira (runJob s'arrête dès qu'ils reviennent). Pendant la
  // construction du zip, fermer le fichier interrompt writeExportZip.
  if (runtime.job.status !== 'preparing') {
    runtime.abort?.();
    await runtime.completion;
  }
  await removeJob(id);
  return true;
}

export async function sweepExpiredJobs(now: number = Date.now()): Promise<void> {
  for (const { job } of [...jobs.values()]) {
    if (!isActive(job) && job.finishedAt && now - job.finishedAt.getTime() > EXPORT_RETENTION_MS) {
      await removeJob(job.id);
    }
  }
}

// Au démarrage : les tâches en mémoire sont perdues, leurs fichiers aussi.
// On vide le contenu sans supprimer le dossier lui-même : c'est souvent un
// point de montage de volume Docker, impossible à supprimer (EBUSY).
export async function resetExportDir(): Promise<void> {
  const dir = exportDir();
  await mkdir(dir, { recursive: true });
  for (const name of await readdir(dir)) await rm(join(dir, name), { recursive: true, force: true });
}

export function startExportSweeper(): NodeJS.Timeout {
  const timer = setInterval(() => {
    sweepExpiredJobs().catch((err: unknown) => console.error('[attachments-export] nettoyage :', err));
  }, SWEEP_INTERVAL_MS);
  timer.unref();
  return timer;
}

// Tests uniquement.
export async function clearExportJobs(): Promise<void> {
  for (const id of [...jobs.keys()]) await cancelExportJob(id);
}
