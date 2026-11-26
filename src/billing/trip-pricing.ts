/**
 * Canonical itinerary list price by trip duration (BRL).
 * Source: product pricing sheet 2026-11-26 — single source of truth in Core.
 *
 * - ≤ 7 days  → R$ 99,90
 * - 8–12 days → R$ 119,90
 * - ≥ 13 days → R$ 139,90
 */

export enum TripPricingTier {
  UP_TO_7 = 'UP_TO_7',
  FROM_8_TO_12 = 'FROM_8_TO_12',
  FROM_13 = 'FROM_13',
}

export const TRIP_PRICING_CURRENCY = 'BRL';

/** Decimal strings — keep two cents for money snapshots. */
export const TRIP_LIST_PRICE_BY_TIER: Record<TripPricingTier, string> = {
  [TripPricingTier.UP_TO_7]: '99.90',
  [TripPricingTier.FROM_8_TO_12]: '119.90',
  [TripPricingTier.FROM_13]: '139.90',
};

export interface TripPricingQuote {
  days: number;
  tier: TripPricingTier;
  /** List price before coupon (BRL). */
  amount: number;
  currency: typeof TRIP_PRICING_CURRENCY;
  /** Same as amount — Decimal-friendly string with 2 places. */
  amountDecimal: string;
}

/**
 * Inclusive calendar-day count between two dates (UTC date parts).
 * start=end → 1 day.
 */
export function countInclusiveCalendarDays(
  start: Date,
  end: Date,
): number {
  const startUtc = Date.UTC(
    start.getUTCFullYear(),
    start.getUTCMonth(),
    start.getUTCDate(),
  );
  const endUtc = Date.UTC(
    end.getUTCFullYear(),
    end.getUTCMonth(),
    end.getUTCDate(),
  );
  const diffDays = Math.floor((endUtc - startUtc) / 86_400_000);
  return Math.max(1, diffDays + 1);
}

/**
 * Resolve trip length for pricing.
 * Prefer persisted day rows / itinerary day count; else start/end dates; else 1.
 */
export function resolveTripDayCount(input: {
  dayCount?: number | null;
  startDate?: Date | string | null;
  endDate?: Date | string | null;
}): number {
  if (
    typeof input.dayCount === 'number' &&
    Number.isFinite(input.dayCount) &&
    input.dayCount > 0
  ) {
    return Math.floor(input.dayCount);
  }

  if (input.startDate && input.endDate) {
    const start =
      input.startDate instanceof Date
        ? input.startDate
        : new Date(input.startDate);
    const end =
      input.endDate instanceof Date ? input.endDate : new Date(input.endDate);
    if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime())) {
      return countInclusiveCalendarDays(start, end);
    }
  }

  return 1;
}

export function resolveTripPricingTier(days: number): TripPricingTier {
  const n = Math.max(1, Math.floor(days));
  if (n <= 7) return TripPricingTier.UP_TO_7;
  if (n <= 12) return TripPricingTier.FROM_8_TO_12;
  return TripPricingTier.FROM_13;
}

export function resolveTripPricing(days: number): TripPricingQuote {
  const normalizedDays = Math.max(1, Math.floor(days));
  const tier = resolveTripPricingTier(normalizedDays);
  const amountDecimal = TRIP_LIST_PRICE_BY_TIER[tier];
  return {
    days: normalizedDays,
    tier,
    amount: Number(amountDecimal),
    currency: TRIP_PRICING_CURRENCY,
    amountDecimal,
  };
}
