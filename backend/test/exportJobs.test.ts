import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import {
  ExportBusyError,
  cancelExportJob,
  clearExportJobs,
  findJobByDownloadToken,
  getExportJob,
  jobCompletion,
  listExportJobs,
  resetExportDir,
  startExportJob,
  sweepExpiredJobs,
  toJobView,
} from '../src/services/exportJobs';
import { planExport } from '../src/services/attachmentExport';
import type { JiraAttachmentMeta } from '../src/lib/jira';
import { readZip } from './helpers/readZip';

function attachment(id: string, filename: string): JiraAttachmentMeta {
  return {
    id,
    filename,
    mimeType: 'text/plain',
    size: 5,
    contentUrl: `https://jira.example.com/att/${id}`,
    authorId: null,
    authorName: null,
  };
}

const ENTRIES = planExport([
  { key: 'PROJ-1', attachments: [attachment('1', 'a.txt'), attachment('2', 'b.txt')] },
  { key: 'PROJ-2', attachments: [attachment('3', 'c.txt')] },
]);

const openStream = async (a: JiraAttachmentMeta) => ({
  body: Readable.toWeb(Readable.from([Buffer.from(`data-${a.id}`)])) as never,
  contentType: 'text/plain',
  contentLength: null,
});

function params(overrides: Partial<Parameters<typeof startExportJob>[0]> = {}): Parameters<typeof startExportJob>[0] {
  return {
    userId: 'admin-1',
    queryId: 'q1',
    queryName: 'Réclamations',
    jql: 'project = PROJ',
    loadEntries: async () => ENTRIES,
    openStream,
    retryDelayMs: 0,
    ...overrides,
  };
}

let exportDir: string;

beforeEach(async () => {
  exportDir = await mkdtemp(join(tmpdir(), 'jiv-export-jobs-test-'));
  process.env.EXPORT_DIR = exportDir;
});

afterEach(async () => {
  await clearExportJobs();
  vi.useRealTimers();
  delete process.env.EXPORT_DIR;
  await rm(exportDir, { recursive: true, force: true });
});

describe('export jobs', () => {
  it('builds the zip on disk in the background and exposes progress then a download token', async () => {
    const job = startExportJob(params());
    expect(['preparing', 'running']).toContain(job.status);

    await jobCompletion(job.id);

    const done = getExportJob(job.id)!;
    expect(done.status).toBe('done');
    expect(done).toMatchObject({ totalFiles: 3, doneFiles: 3, failedFiles: 0, totalBytes: 15, processedBytes: 15 });
    expect(done.zipBytes).toBeGreaterThan(0);
    expect(done.downloadToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(findJobByDownloadToken(done.downloadToken!)?.id).toBe(job.id);
    expect(done.fileName).toMatch(/^pieces-jointes-reclamations-\d{4}-\d{2}-\d{2}\.zip$/);

    const files = readZip(await readFile(done.filePath!));
    expect(Object.keys(files)).toEqual(['PROJ-1/a.txt', 'PROJ-1/b.txt', 'PROJ-2/c.txt', 'manifest.csv']);
    // Seul le zip final reste dans le dossier d'export (pas de .part).
    expect(await readdir(exportDir)).toEqual([`${job.id}.zip`]);
  });

  it('exposes a public view without server paths or tokens other than the download URL', async () => {
    const job = startExportJob(params());
    await jobCompletion(job.id);
    const view = toJobView(getExportJob(job.id)!);
    expect(view).not.toHaveProperty('filePath');
    expect(view).not.toHaveProperty('downloadToken');
    expect(view.downloadUrl).toMatch(/^\/api\/downloads\/attachments-export\/[A-Za-z0-9_-]{43}$/);
  });

  it('refuses to start a second export while one is in progress', async () => {
    let release!: () => void;
    const job = startExportJob(params({ loadEntries: () => new Promise((r) => (release = () => r(ENTRIES))) }));
    expect(() => startExportJob(params({ queryId: 'q2' }))).toThrow(ExportBusyError);
    release();
    await jobCompletion(job.id);
    expect(() => startExportJob(params())).not.toThrow();
  });

  it('replaces the previous finished export of the same query', async () => {
    const first = startExportJob(params());
    await jobCompletion(first.id);
    const second = startExportJob(params());
    await jobCompletion(second.id);
    expect(listExportJobs().map((j) => j.id)).toEqual([second.id]);
    expect(await readdir(exportDir)).toEqual([`${second.id}.zip`]);
  });

  it('marks the job as failed when the Jira metadata cannot be loaded', async () => {
    const job = startExportJob(params({ loadEntries: async () => Promise.reject(new Error('Jira indisponible')) }));
    await jobCompletion(job.id);
    expect(getExportJob(job.id)).toMatchObject({ status: 'failed', error: 'Jira indisponible' });
  });

  it('cancels a running export and removes its files', async () => {
    let unblock!: () => void;
    const blocked = new Promise<void>((r) => (unblock = r));
    const job = startExportJob(
      params({
        openStream: async (a) => {
          if (a.id === '2') await blocked;
          return openStream(a);
        },
      }),
    );
    await vi.waitFor(() => expect(getExportJob(job.id)?.doneFiles).toBe(1));

    const cancelled = cancelExportJob(job.id);
    unblock();
    await cancelled;

    expect(getExportJob(job.id)).toBeUndefined();
    expect(await readdir(exportDir)).toEqual([]);
  });

  it('deletes finished exports after 24 hours', async () => {
    const job = startExportJob(params());
    await jobCompletion(job.id);
    await sweepExpiredJobs(Date.now() + 23 * 3_600_000);
    expect(getExportJob(job.id)).toBeDefined();
    await sweepExpiredJobs(Date.now() + 25 * 3_600_000);
    expect(getExportJob(job.id)).toBeUndefined();
    expect(await readdir(exportDir)).toEqual([]);
  });

  it('cancels an export still waiting on Jira metadata without waiting for Jira', async () => {
    const job = startExportJob(params({ loadEntries: () => new Promise(() => undefined) }));
    await cancelExportJob(job.id);
    expect(getExportJob(job.id)).toBeUndefined();
  });

  it('empties the export directory on startup but keeps the directory (Docker volume mount point)', async () => {
    await writeFile(join(exportDir, 'orphan.zip'), 'x');
    await resetExportDir();
    expect((await stat(exportDir)).isDirectory()).toBe(true);
    expect(await readdir(exportDir)).toEqual([]);
  });
});
