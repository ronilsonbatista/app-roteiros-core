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

/** Alias groups so Tokyo / Tóquio / Tokio tips and covers resolve together. */
const DESTINATION_KEY_ALIASES: Record<string, string[]> = {
  tokyo: ['tokyo', 'toquio', 'tokio'],
  toquio: ['tokyo', 'toquio', 'tokio'],
  tokio: ['tokyo', 'toquio', 'tokio'],
  rome: ['rome', 'roma'],
  roma: ['rome', 'roma'],
};

/** Expand a key to itself + known aliases for tip / cover lookups. */
export function expandDestinationKeyAliases(key: string): string[] {
  const normalized = key.trim().toLowerCase();
  if (!normalized) return [];
  const group = DESTINATION_KEY_ALIASES[normalized];
  if (!group) return [normalized];
  return [...new Set(group)];
}
