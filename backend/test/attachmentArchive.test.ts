import { describe, expect, it } from 'vitest';
import { PassThrough, Readable } from 'node:stream';
import {
  uniqueEntryNames,
  visibleAttachmentsFor,
  writeAttachmentsZip,
  zipFileName,
} from '../src/services/attachmentArchive';
import type { JiraAttachmentMeta } from '../src/lib/jira';
import { readZip } from './helpers/readZip';

function attachment(id: string, filename: string, authorId: string | null): JiraAttachmentMeta {
  return {
    id,
    filename,
    mimeType: 'text/plain',
    size: 1,
    contentUrl: `https://jira.example.com/att/${id}`,
    authorId,
    authorName: null,
  };
}

function streamOf(text: string) {
  return {
    body: Readable.toWeb(Readable.from([Buffer.from(text)])) as never,
    contentType: 'text/plain',
    contentLength: text.length,
  };
}

async function collect(stream: PassThrough): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
}

describe('visibleAttachmentsFor', () => {
  const all = [attachment('1', 'a.txt', 'reporter'), attachment('2', 'b.txt', 'agent'), attachment('3', 'c.txt', null)];

  it('gives ADMIN every attachment', () => {
    expect(visibleAttachmentsFor('ADMIN', all, 'reporter').map((a) => a.id)).toEqual(['1', '2', '3']);
  });

  it("restricts USER to the reporter's attachments", () => {
    expect(visibleAttachmentsFor('USER', all, 'reporter').map((a) => a.id)).toEqual(['1']);
  });

  it('gives USER nothing when the issue has no reporter', () => {
    expect(visibleAttachmentsFor('USER', all, null)).toEqual([]);
  });
});

describe('uniqueEntryNames', () => {
  it('suffixes duplicate names (case-insensitively) before the extension', () => {
    expect(uniqueEntryNames(['rapport.pdf', 'Rapport.pdf', 'rapport.pdf', 'notes'])).toEqual([
      'rapport.pdf',
      'Rapport (2).pdf',
      'rapport (3).pdf',
      'notes',
    ]);
  });

  it('neutralises path separators to prevent zip slip', () => {
    expect(uniqueEntryNames(['../../etc/passwd', 'a\\b.txt', '..', ''])).toEqual([
      '.._.._etc_passwd',
      'a_b.txt',
      'piece-jointe',
      'piece-jointe (2)',
    ]);
  });
});

describe('zipFileName', () => {
  it('builds a safe archive name from the issue key', () => {
    expect(zipFileName('PROJ-12')).toBe('PROJ-12-pieces-jointes.zip');
    expect(zipFileName('PR"OJ/1')).toBe('PR_OJ_1-pieces-jointes.zip');
  });
});

describe('writeAttachmentsZip', () => {
  it('writes every attachment into a valid zip, fetching them one at a time', async () => {
    const files = [attachment('1', 'a.txt', null), attachment('2', 'a.txt', null), attachment('3', 'b.txt', null)];
    let inFlight = 0;
    let maxInFlight = 0;
    const openStream = async (a: JiraAttachmentMeta) => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight -= 1;
      return streamOf(`contenu ${a.id}`);
    };
    const output = new PassThrough();
    const bufferPromise = collect(output);

    await writeAttachmentsZip(files, openStream, output);

    expect(readZip(await bufferPromise)).toEqual({
      'a.txt': 'contenu 1',
      'a (2).txt': 'contenu 2',
      'b.txt': 'contenu 3',
    });
    expect(maxInFlight).toBe(1);
  });

  it('rejects when an attachment cannot be fetched from Jira', async () => {
    const output = new PassThrough();
    void collect(output);
    const openStream = async (a: JiraAttachmentMeta) => {
      if (a.id === '2') throw new Error('Attachment fetch failed');
      return streamOf('ok');
    };

    await expect(
      writeAttachmentsZip([attachment('1', 'a.txt', null), attachment('2', 'b.txt', null)], openStream, output),
    ).rejects.toThrow('Attachment fetch failed');
  });
});
