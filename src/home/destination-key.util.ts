/**
 * Normalize a destination display name into a stable lookup key.
 * "Roma" → "roma", "São Paulo" → "sao-paulo", "Rio de Janeiro" → "rio-de-janeiro".
 */
export function normalizeDestinationKey(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
