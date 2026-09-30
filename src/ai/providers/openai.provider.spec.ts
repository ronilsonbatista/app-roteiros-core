import { inferCurrency, OpenAIProvider } from './openai.provider';

describe('OpenAIProvider & inferCurrency', () => {
  describe('inferCurrency', () => {
    it('should infer EUR for European destinations', () => {
      expect(inferCurrency('Roma')).toBe('EUR');
      expect(inferCurrency('Paris, França')).toBe('EUR');
      expect(inferCurrency('Madrid, Espanha')).toBe('EUR');
      expect(inferCurrency('Lisboa, Portugal')).toBe('EUR');
    });

    it('should infer JPY for Japanese destinations', () => {
      expect(inferCurrency('Tóquio')).toBe('JPY');
      expect(inferCurrency('Kyoto, Japan')).toBe('JPY');
      expect(inferCurrency('Osaka')).toBe('JPY');
    });

    it('should infer KRW for South Korea', () => {
      expect(inferCurrency('Seul')).toBe('KRW');
      expect(inferCurrency('Seoul, South Korea')).toBe('KRW');
    });

    it('should infer THB for Thailand', () => {
      expect(inferCurrency('Bangkok')).toBe('THB');
      expect(inferCurrency('Phuket, Tailândia')).toBe('THB');
    });

    it('should infer USD for United States', () => {
      expect(inferCurrency('Nova York, Estados Unidos')).toBe('USD');
      expect(inferCurrency('Miami, USA')).toBe('USD');
    });

    it('should infer BRL only for Brazilian destinations', () => {
      expect(inferCurrency('Rio de Janeiro, Brasil')).toBe('BRL');
      expect(inferCurrency('São Paulo')).toBe('BRL');
    });
  });

  describe('OpenAIProvider instantiation', () => {
    it('should instantiate cleanly without apiKey in test environment', () => {
      const provider = new OpenAIProvider();
      expect(provider).toBeDefined();
    });
  });
});
