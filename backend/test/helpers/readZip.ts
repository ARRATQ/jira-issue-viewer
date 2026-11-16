import { inflateRawSync } from 'node:zlib';

// Lecteur zip minimal pour les tests : parcourt le répertoire central (les
// tailles des en-têtes locaux valent 0 quand archiver streame des entrées)
// et renvoie { nom → contenu décompressé }.
export function readZip(buffer: Buffer): Record<string, string> {
  const eocd = buffer.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocd < 0) throw new Error('Not a zip: end of central directory not found');
  const entryCount = buffer.readUInt16LE(eocd + 10);
  let offset = buffer.readUInt32LE(eocd + 16);

  const files: Record<string, string> = {};
  for (let i = 0; i < entryCount; i += 1) {
    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localHeader = buffer.readUInt32LE(offset + 42);
    const name = buffer.toString('utf8', offset + 46, offset + 46 + nameLength);

    const localNameLength = buffer.readUInt16LE(localHeader + 26);
    const localExtraLength = buffer.readUInt16LE(localHeader + 28);
    const dataStart = localHeader + 30 + localNameLength + localExtraLength;
    const data = buffer.subarray(dataStart, dataStart + compressedSize);
    files[name] = (method === 8 ? inflateRawSync(data) : data).toString('utf8');

    offset += 46 + nameLength + extraLength + commentLength;
  }
  return files;
}
