import { slugify } from './slugify';

describe('slugify', () => {
  it('remove acentos e espaços', () => {
    expect(slugify('São Paulo')).toBe('sao-paulo');
    expect(slugify('Rio de Janeiro')).toBe('rio-de-janeiro');
  });
});
