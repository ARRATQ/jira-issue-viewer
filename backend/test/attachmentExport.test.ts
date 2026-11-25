import { describe, expect, it } from 'vitest';
import { PassThrough, Readable } from 'node:stream';
import {
  ExportAbortedError,
  MANIFEST_NAME,
  buildManifestCsv,
  exportZipFileName,
  planExport,
  writeExportZip,
} from '../src/services/attachmentExport';
import { JiraApiError, type JiraAttachmentMeta } from '../src/lib/jira';
import { readZip } from './helpers/readZip';

function attachment(id: string, filename: string, extra: Partial<JiraAttachmentMeta> = {}): JiraAttachmentMeta {
  return {
    id,
    filename,
    mimeType: 'text/plain',
    size: 10,
    contentUrl: `https://jira.example.com/att/${id}`,
    authorId: null,
    authorName: null,
    ...extra,
  };
}

async function collect(stream: PassThrough): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
}

describe('planExport', () => {
  it('places each attachment in a folder named after its issue key', () => {
    const entries = planExport([
      { key: 'PROJ-1', attachments: [attachment('1', 'devis.pdf'), attachment('2', 'photo.jpg')] },
      { key: 'PROJ-2', attachments: [attachment('3', 'devis.pdf')] },
    ]);
    expect(entries.map((e) => [e.issueKey, e.attachment.id, e.path])).toEqual([
      ['PROJ-1', '1', 'PROJ-1/devis.pdf'],
      ['PROJ-1', '2', 'PROJ-1/photo.jpg'],
      ['PROJ-2', '3', 'PROJ-2/devis.pdf'],
    ]);
  });

  it('deduplicates names within a ticket and neutralises unsafe keys and names', () => {
    const entries = planExport([
      { key: '../EVIL', attachments: [attachment('1', 'a.txt'), attachment('2', 'a.txt'), attachment('3', '../x')] },
    ]);
    expect(entries.map((e) => e.path)).toEqual(['___EVIL/a.txt', '___EVIL/a (2).txt', '___EVIL/.._x']);
  });

  it('skips issues without attachments', () => {
    expect(planExport([{ key: 'PROJ-1', attachments: [] }])).toEqual([]);
  });
});

describe('buildManifestCsv', () => {
  it('marks failed files as errors, without a zip path', () => {
    const entries = planExport([{ key: 'PROJ-1', attachments: [attachment('1', 'a.txt'), attachment('2', 'b.txt')] }]);
    const csv = buildManifestCsv(entries, new Map([['2', 'HTTP 404']]));
    expect(csv.split('\r\n').slice(1, 3)).toEqual([
      'PROJ-1;a.txt;PROJ-1/a.txt;10;text/plain;ok;',
      'PROJ-1;b.txt;;10;text/plain;erreur;HTTP 404',
    ]);
  });

  it('writes one row per file with key, original name, zip path, size and mime type', () => {
    const csv = buildManifestCsv(
      planExport([
        {
          key: 'PROJ-1',
          attachments: [attachment('1', 'devis;v2.pdf', { size: 1234, mimeType: 'application/pdf' })],
        },
      ]),
    );
    expect(csv).toBe(
      '﻿cle_ticket;nom_fichier;chemin_dans_zip;taille_octets;type_mime;statut;erreur\r\n' +
        'PROJ-1;"devis;v2.pdf";"PROJ-1/devis;v2.pdf";1234;application/pdf;ok;\r\n',
    );
  });

  it('escapes double quotes and keeps file names unaltered', () => {
    const csv = buildManifestCsv(planExport([{ key: 'PROJ-1', attachments: [attachment('1', 'le "bon".txt')] }]));
    expect(csv.split('\r\n')[1]).toBe('PROJ-1;"le ""bon"".txt";"PROJ-1/le ""bon"".txt";10;text/plain;ok;');
  });
});

describe('exportZipFileName', () => {
  it('builds a dated, ascii-safe archive name from the query name', () => {
    expect(exportZipFileName('Réclamations Export', new Date(2026, 10, 25))).toBe(
      'pieces-jointes-reclamations-export-2026-11-25.zip',
    );
    expect(exportZipFileName('***', new Date(2026, 0, 2))).toBe('pieces-jointes-export-2026-01-02.zip');
  });
});

describe('writeExportZip', () => {
  it('writes every file under its path, then the manifest at the root', async () => {
    const entries = planExport([
      { key: 'PROJ-1', attachments: [attachment('1', 'a.txt')] },
      { key: 'PROJ-2', attachments: [attachment('2', 'b.txt')] },
    ]);
    const output = new PassThrough();
    const done = writeExportZip(
      entries,
      async (a) => ({
        body: Readable.toWeb(Readable.from([Buffer.from(`content-${a.id}`)])) as never,
        contentType: 'text/plain',
        contentLength: null,
      }),
      output,
    );
    const [buffer] = await Promise.all([collect(output), done]);

    const files = readZip(buffer);
    expect(Object.keys(files)).toEqual(['PROJ-1/a.txt', 'PROJ-2/b.txt', MANIFEST_NAME]);
    expect(files['PROJ-1/a.txt']).toBe('content-1');
    expect(files[MANIFEST_NAME]).toContain('PROJ-2;b.txt;PROJ-2/b.txt;10;text/plain;ok;');
  });

  it('skips a file Jira refuses to serve, reports it in the manifest and the result, and keeps going', async () => {
    const entries = planExport([
      { key: 'PROJ-1', attachments: [attachment('1', 'a.txt'), attachment('2', 'gone.txt')] },
      { key: 'PROJ-2', attachments: [attachment('3', 'c.txt')] },
    ]);
    const output = new PassThrough();
    const done = writeExportZip(
      entries,
      async (a) => {
        if (a.id === '2') throw new JiraApiError(404, 'Attachment fetch failed');
        return {
          body: Readable.toWeb(Readable.from([Buffer.from(`content-${a.id}`)])) as never,
          contentType: 'text/plain',
          contentLength: null,
        };
      },
      output,
    );
    const [buffer, result] = await Promise.all([collect(output), done]);

    const files = readZip(buffer);
    expect(Object.keys(files)).toEqual(['PROJ-1/a.txt', 'PROJ-2/c.txt', MANIFEST_NAME]);
    expect(files[MANIFEST_NAME]).toContain('PROJ-1;gone.txt;;10;text/plain;erreur;HTTP 404');
    expect(result).toEqual({ written: 2, failed: [{ issueKey: 'PROJ-1', filename: 'gone.txt', reason: 'HTTP 404' }] });
  });

  it('stops fetching from Jira as soon as the client goes away', async () => {
    const entries = planExport([
      { key: 'PROJ-1', attachments: [attachment('1', 'a.txt'), attachment('2', 'b.txt'), attachment('3', 'c.txt')] },
    ]);
    const output = new PassThrough();
    output.resume();
    const opened: string[] = [];
    const result = await writeExportZip(
      entries,
      async (a) => {
        opened.push(a.id);
        // Le client se déconnecte pendant le 1er fichier.
        if (a.id === '1') output.destroy();
        return {
          body: Readable.toWeb(Readable.from([Buffer.from('x')])) as never,
          contentType: 'text/plain',
          contentLength: null,
        };
      },
      output,
    ).catch((err: unknown) => err);

    expect(result).toBeInstanceOf(ExportAbortedError);
    expect(opened).toEqual(['1']);
  });
});
