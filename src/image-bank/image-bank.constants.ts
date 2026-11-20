/** Uma cidade publicada tem exatamente esta quantidade de fotos HD originais. */
export const PUBLISHED_CITY_IMAGE_COUNT = 5;

export const IMAGE_BANK_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;

export function imageBankMaxBytes(): number {
  const parsed = Number(process.env.IMAGE_BANK_MAX_FILE_SIZE_MB || '25');
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 200) {
    return 25 * 1024 * 1024;
  }
  return Math.floor(parsed * 1024 * 1024);
}
