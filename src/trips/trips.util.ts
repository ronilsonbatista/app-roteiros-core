export function isTripLocked(trip: {
  createdFromGuestJourneys?: any[];
  purchases?: any[];
  premiumUnlockedAt?: Date | null;
}): boolean {
  if (!trip) return false;
  const isPayableProductTrip =
    (Array.isArray(trip.createdFromGuestJourneys) &&
      trip.createdFromGuestJourneys.length > 0) ||
    (Array.isArray(trip.purchases) && trip.purchases.length > 0);
  return Boolean(isPayableProductTrip && trip.premiumUnlockedAt == null);
}
