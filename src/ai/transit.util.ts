import { TransitMode } from '@prisma/client';

/**
 * Calculates great-circle distance between two points on Earth using Haversine formula (in meters).
 */
export function calculateHaversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371000; // Earth radius in meters
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

export interface TransitEstimate {
  transitDistanceMeters: number | null;
  transitDurationMinutes: number | null;
  transitMode: TransitMode;
}

/**
 * Estimates transit distance, duration, and recommended mode between two coordinates.
 * Returns null distance/duration if either coordinate is invalid ("não inventar metros").
 */
export function estimateTransit(
  fromLat?: number | null,
  fromLon?: number | null,
  toLat?: number | null,
  toLon?: number | null,
): TransitEstimate {
  if (
    fromLat == null ||
    fromLon == null ||
    toLat == null ||
    toLon == null ||
    !Number.isFinite(fromLat) ||
    !Number.isFinite(fromLon) ||
    !Number.isFinite(toLat) ||
    !Number.isFinite(toLon)
  ) {
    return {
      transitDistanceMeters: null,
      transitDurationMinutes: null,
      transitMode: TransitMode.WALKING,
    };
  }

  const distanceMeters = calculateHaversineDistance(
    fromLat,
    fromLon,
    toLat,
    toLon,
  );

  if (distanceMeters < 50) {
    return {
      transitDistanceMeters: distanceMeters,
      transitDurationMinutes: 1,
      transitMode: TransitMode.WALKING,
    };
  }

  if (distanceMeters <= 2000) {
    // Walking: avg ~75 m/min (~4.5 km/h)
    const minutes = Math.max(1, Math.round(distanceMeters / 75));
    return {
      transitDistanceMeters: distanceMeters,
      transitDurationMinutes: minutes,
      transitMode: TransitMode.WALKING,
    };
  }

  if (distanceMeters <= 15000) {
    // Transit: avg ~300 m/min + 5 min waiting/transfer
    const minutes = Math.max(5, Math.round(distanceMeters / 300 + 5));
    return {
      transitDistanceMeters: distanceMeters,
      transitDurationMinutes: minutes,
      transitMode: TransitMode.TRANSIT,
    };
  }

  // Driving / Transfer: avg ~600 m/min (~36 km/h in city)
  const minutes = Math.max(15, Math.round(distanceMeters / 600));
  return {
    transitDistanceMeters: distanceMeters,
    transitDurationMinutes: minutes,
    transitMode: TransitMode.DRIVING,
  };
}
