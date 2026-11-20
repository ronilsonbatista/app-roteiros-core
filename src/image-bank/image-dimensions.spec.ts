import { inspectImage } from './image-dimensions';

const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

function jpeg(width: number, height: number): Buffer {
  return Buffer.from([
    0xff,
    0xd8,
    0xff,
    0xc0,
    0x00,
    0x0b,
    0x08,
    (height >> 8) & 0xff,
    height & 0xff,
    (width >> 8) & 0xff,
    width & 0xff,
    0x01,
    0x01,
    0x11,
    0x00,
    0xff,
    0xd9,
  ]);
}

function webpVp8l(width: number, height: number): Buffer {
  const bits = (width - 1) | ((height - 1) << 14);
  const payload = Buffer.alloc(5);
  payload[0] = 0x2f;
  payload.writeUInt32LE(bits, 1);
  const header = Buffer.alloc(20);
  header.write('RIFF', 0);
  header.writeUInt32LE(12 + payload.length, 4);
  header.write('WEBP', 8);
  header.write('VP8L', 12);
  header.writeUInt32LE(payload.length, 16);
  return Buffer.concat([header, payload]);
}

describe('inspectImage', () => {
  it('lê PNG, JPEG e WebP sem guardar o binário no resultado', () => {
    expect(inspectImage(PNG_1X1)).toEqual({
      mimeType: 'image/png',
      width: 1,
      height: 1,
    });
    expect(inspectImage(jpeg(3, 2))).toEqual({
      mimeType: 'image/jpeg',
      width: 3,
      height: 2,
    });
    expect(inspectImage(webpVp8l(8, 6))).toEqual({
      mimeType: 'image/webp',
      width: 8,
      height: 6,
    });
  });

  it('recusa arquivo que não é imagem', () => {
    expect(inspectImage(Buffer.from('not-an-image'))).toBeNull();
  });
});
