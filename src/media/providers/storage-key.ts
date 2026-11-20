import { BadRequestException } from '@nestjs/common';

/** Chave relativa do object storage. Recusa path traversal e absoluto. */
export function normalizeStorageKey(key: string): string {
  if (typeof key !== 'string') {
    throw new BadRequestException('Chave de storage inválida');
  }

  const clean = key.trim().replace(/^\/+/, '');
  if (!clean || clean.includes('\\')) {
    throw new BadRequestException('Chave de storage inválida');
  }

  const parts = clean.split('/');
  if (
    parts.some((part) => part.length === 0 || part === '.' || part === '..')
  ) {
    throw new BadRequestException('Chave de storage inválida');
  }

  return parts.join('/');
}
