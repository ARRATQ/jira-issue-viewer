import { describe, expect, it } from 'vitest';
import { PassThrough, Readable } from 'node:stream';
import {
  MANIFEST_NAME,
  buildManifestCsv,
  exportZipFileName,
  planExport,
  writeExportZip,
} from '../src/services/attachmentExport';
import type { JiraAttachmentMeta } from '../src/lib/jira';
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
      '﻿cle_ticket;nom_fichier;chemin_dans_zip;taille_octets;type_mime\r\n' +
        'PROJ-1;"devis;v2.pdf";"PROJ-1/devis;v2.pdf";1234;application/pdf\r\n',
    );
  });

  it('escapes double quotes and keeps file names unaltered', () => {
    const csv = buildManifestCsv(planExport([{ key: 'PROJ-1', attachments: [attachment('1', 'le "bon".txt')] }]));
    expect(csv.split('\r\n')[1]).toBe('PROJ-1;"le ""bon"".txt";"PROJ-1/le ""bon"".txt";10;text/plain');
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
    expect(files[MANIFEST_NAME]).toContain('PROJ-2;b.txt;PROJ-2/b.txt;10;text/plain');
  });

  it('rejects when an attachment cannot be fetched', async () => {
    const entries = planExport([{ key: 'PROJ-1', attachments: [attachment('1', 'a.txt')] }]);
    const output = new PassThrough();
    output.resume();
    await expect(
      writeExportZip(entries, async () => Promise.reject(new Error('Jira down')), output),
    ).rejects.toThrow('Jira down');
  });
});
