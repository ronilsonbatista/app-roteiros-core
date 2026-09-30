import {
  calculateHaversineDistance,
  estimateTransit,
} from './transit.util';
import { TransitMode } from '@prisma/client';

describe('transit.util (Geodesic Distance & Transit Estimation)', () => {
  it('should calculate Haversine distance between two known coordinates', () => {
    // Colosseum (41.8902, 12.4922) to Trevi Fountain (41.9009, 12.4833) ~1.4 km
    const distance = calculateHaversineDistance(
      41.8902,
      12.4922,
      41.9009,
      12.4833,
    );
    expect(distance).toBeGreaterThan(1200);
    expect(distance).toBeLessThan(1600);
  });

  it('should return null distance and duration when coordinates are missing ("não inventar metros")', () => {
    const res1 = estimateTransit(null, null, 41.9009, 12.4833);
    expect(res1.transitDistanceMeters).toBeNull();
    expect(res1.transitDurationMinutes).toBeNull();
    expect(res1.transitMode).toEqual(TransitMode.WALKING);

    const res2 = estimateTransit(41.8902, 12.4922, null, undefined);
    expect(res2.transitDistanceMeters).toBeNull();
    expect(res2.transitDurationMinutes).toBeNull();
  });

  it('should assign WALKING mode for distances <= 2000m', () => {
    // Distance ~1.4 km
    const res = estimateTransit(41.8902, 12.4922, 41.9009, 12.4833);
    expect(res.transitDistanceMeters).toBeGreaterThan(1200);
    expect(res.transitDurationMinutes).toBeGreaterThan(10);
    expect(res.transitMode).toEqual(TransitMode.WALKING);
  });

  it('should assign TRANSIT mode for medium distances (2km - 15km)', () => {
    // Colosseum (41.8902, 12.4922) to Rome Ciampino Airport (41.7994, 12.5949) ~13 km
    const res = estimateTransit(41.8902, 12.4922, 41.7994, 12.5949);
    expect(res.transitDistanceMeters).toBeGreaterThan(10000);
    expect(res.transitDistanceMeters).toBeLessThan(15000);
    expect(res.transitMode).toEqual(TransitMode.TRANSIT);
  });

  it('should assign DRIVING mode for long distances (> 15km)', () => {
    // Rome (41.9028, 12.4964) to Fiumicino Airport (41.8003, 12.2389) ~24 km
    const res = estimateTransit(41.9028, 12.4964, 41.8003, 12.2389);
    expect(res.transitDistanceMeters).toBeGreaterThan(20000);
    expect(res.transitMode).toEqual(TransitMode.DRIVING);
  });
});
