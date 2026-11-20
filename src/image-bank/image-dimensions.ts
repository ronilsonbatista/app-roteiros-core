export type ImageMimeType = 'image/jpeg' | 'image/png' | 'image/webp';

export interface InspectedImage {
  mimeType: ImageMimeType;
  width: number;
  height: number;
}

interface Size {
  width: number;
  height: number;
}

/** Lê mime e dimensões a partir dos bytes. Não decodifica o pixel. */
export function inspectImage(buffer: Buffer): InspectedImage | null {
  if (!buffer || buffer.length < 16) return null;

  if (isPng(buffer)) {
    const size = readPng(buffer);
    return size ? { mimeType: 'image/png', ...size } : null;
  }
  if (isJpeg(buffer)) {
    const size = readJpeg(buffer);
    return size ? { mimeType: 'image/jpeg', ...size } : null;
  }
  if (isWebp(buffer)) {
    const size = readWebp(buffer);
    return size ? { mimeType: 'image/webp', ...size } : null;
  }
  return null;
}

function isPng(buffer: Buffer): boolean {
  return (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  );
}

function isJpeg(buffer: Buffer): boolean {
  return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
}

function isWebp(buffer: Buffer): boolean {
  return (
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  );
}

function readPng(buffer: Buffer): Size | null {
  if (buffer.length < 24) return null;
  if (buffer.toString('ascii', 12, 16) !== 'IHDR') return null;
  return positive(buffer.readUInt32BE(16), buffer.readUInt32BE(20));
}

function readJpeg(buffer: Buffer): Size | null {
  let offset = 2;
  while (offset + 8 < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = buffer[offset + 1];
    if (marker === 0xff) {
      offset += 1;
      continue;
    }
    const standalone =
      marker === 0x01 ||
      marker === 0xd8 ||
      marker === 0xd9 ||
      (marker >= 0xd0 && marker <= 0xd7);
    if (standalone) {
      offset += 2;
      continue;
    }
    if (offset + 4 > buffer.length) return null;
    const segmentLength = buffer.readUInt16BE(offset + 2);
    if (segmentLength < 2) return null;
    const isSof =
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf);
    if (isSof) {
      if (offset + 9 > buffer.length) return null;
      return positive(
        buffer.readUInt16BE(offset + 7),
        buffer.readUInt16BE(offset + 5),
      );
    }
    offset += 2 + segmentLength;
  }
  return null;
}

function readWebp(buffer: Buffer): Size | null {
  if (buffer.length < 25) return null;
  const chunk = buffer.toString('ascii', 12, 16);
  if (chunk === 'VP8X' && buffer.length >= 30) {
    return positive(1 + buffer.readUIntLE(24, 3), 1 + buffer.readUIntLE(27, 3));
  }
  if (chunk === 'VP8 ' && buffer.length >= 30) {
    if (buffer[23] !== 0x9d || buffer[24] !== 0x01 || buffer[25] !== 0x2a) {
      return null;
    }
    return positive(
      buffer.readUInt16LE(26) & 0x3fff,
      buffer.readUInt16LE(28) & 0x3fff,
    );
  }
  if (chunk === 'VP8L' && buffer[20] === 0x2f) {
    const bits = buffer.readUInt32LE(21);
    return positive((bits & 0x3fff) + 1, ((bits >> 14) & 0x3fff) + 1);
  }
  return null;
}

function positive(width: number, height: number): Size | null {
  if (!Number.isInteger(width) || !Number.isInteger(height)) return null;
  if (width < 1 || height < 1 || width > 100_000 || height > 100_000) {
    return null;
  }
  return { width, height };
}
