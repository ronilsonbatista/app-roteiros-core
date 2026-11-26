import {
  TripPricingTier,
  countInclusiveCalendarDays,
  resolveTripDayCount,
  resolveTripPricing,
  resolveTripPricingTier,
} from './trip-pricing';

describe('trip-pricing (duration → BRL list price)', () => {
  describe('resolveTripPricingTier / resolveTripPricing', () => {
    it.each([
      [1, TripPricingTier.UP_TO_7, 99.9, '99.90'],
      [7, TripPricingTier.UP_TO_7, 99.9, '99.90'],
      [8, TripPricingTier.FROM_8_TO_12, 119.9, '119.90'],
      [12, TripPricingTier.FROM_8_TO_12, 119.9, '119.90'],
      [13, TripPricingTier.FROM_13, 139.9, '139.90'],
      [30, TripPricingTier.FROM_13, 139.9, '139.90'],
    ])(
      'days=%s → tier=%s amount=%s',
      (days, tier, amount, amountDecimal) => {
        expect(resolveTripPricingTier(days)).toBe(tier);
        expect(resolveTripPricing(days)).toEqual({
          days,
          tier,
          amount,
          currency: 'BRL',
          amountDecimal,
        });
      },
    );

    it('floors fractional days and clamps below 1 to lowest tier', () => {
      expect(resolveTripPricing(0).days).toBe(1);
      expect(resolveTripPricing(0).tier).toBe(TripPricingTier.UP_TO_7);
      expect(resolveTripPricing(7.9).days).toBe(7);
      expect(resolveTripPricing(7.9).tier).toBe(TripPricingTier.UP_TO_7);
    });
  });

  describe('countInclusiveCalendarDays', () => {
    it('counts inclusive UTC calendar days', () => {
      expect(
        countInclusiveCalendarDays(
          new Date('2026-07-01T12:00:00.000Z'),
          new Date('2026-07-01T23:00:00.000Z'),
        ),
      ).toBe(1);
      expect(
        countInclusiveCalendarDays(
          new Date('2026-07-01T00:00:00.000Z'),
          new Date('2026-07-07T00:00:00.000Z'),
        ),
      ).toBe(7);
      expect(
        countInclusiveCalendarDays(
          new Date('2026-07-01T00:00:00.000Z'),
          new Date('2026-07-13T00:00:00.000Z'),
        ),
      ).toBe(13);
    });
  });

  describe('resolveTripDayCount', () => {
    it('prefers explicit dayCount', () => {
      expect(
        resolveTripDayCount({
          dayCount: 10,
          startDate: new Date('2026-01-01'),
          endDate: new Date('2026-01-02'),
        }),
      ).toBe(10);
    });

    it('falls back to start/end dates', () => {
      expect(
        resolveTripDayCount({
          startDate: '2026-11-01',
          endDate: '2026-11-12',
        }),
      ).toBe(12);
    });

    it('defaults to 1 when nothing usable', () => {
      expect(resolveTripDayCount({})).toBe(1);
      expect(resolveTripDayCount({ dayCount: 0 })).toBe(1);
    });
  });
});
