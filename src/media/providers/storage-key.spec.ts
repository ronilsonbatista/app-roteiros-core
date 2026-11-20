import { BadRequestException } from '@nestjs/common';
import { normalizeStorageKey } from './storage-key';

describe('normalizeStorageKey', () => {
  it('aceita chave relativa e remove barra inicial', () => {
    expect(normalizeStorageKey('/image-bank/city/photo.jpg')).toBe(
      'image-bank/city/photo.jpg',
    );
  });

  it.each(['../etc/passwd', 'a/../../b', 'a//b', 'a\\b', '', '   '])(
    'recusa chave insegura %p',
    (key) => {
      expect(() => normalizeStorageKey(key)).toThrow(BadRequestException);
    },
  );
});
