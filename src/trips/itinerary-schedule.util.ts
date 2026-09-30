import { PrismaService } from '../prisma/prisma.service';
import { estimateTransit } from '../ai/transit.util';
import { TransitMode } from '@prisma/client';

export function parseTimeToMinutes(timeStr?: string | null): number | null {
  if (!timeStr) return null;
  const match = timeStr.trim().match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  if (isNaN(hours) || isNaN(minutes)) return null;
  return hours * 60 + minutes;
}

export function formatMinutesToTime(totalMinutes: number): string {
  const clamped = Math.max(0, Math.min(24 * 60 - 1, Math.round(totalMinutes)));
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export async function recalculateDayTransits(
  tripDayId: string,
  prisma: PrismaService,
): Promise<void> {
  const day = await prisma.tripDay.findUnique({
    where: { id: tripDayId },
    include: {
      trip: { include: { accommodation: true } },
      items: { orderBy: { order: 'asc' } },
    },
  });

  if (!day || !day.items.length) return;

  const accommodation = day.trip.accommodation;

  for (let i = 0; i < day.items.length; i++) {
    const current = day.items[i];
    let estimate;

    if (i === 0) {
      if (
        day.dayNumber === 1 &&
        accommodation &&
        accommodation.latitude != null &&
        accommodation.longitude != null &&
        current.latitude != null &&
        current.longitude != null
      ) {
        estimate = estimateTransit(
          accommodation.latitude,
          accommodation.longitude,
          current.latitude,
          current.longitude,
        );
      } else {
        estimate = {
          transitDistanceMeters: null,
          transitDurationMinutes: null,
          transitMode: TransitMode.WALKING,
        };
      }
    } else {
      const prev = day.items[i - 1];
      if (
        prev.latitude != null &&
        prev.longitude != null &&
        current.latitude != null &&
        current.longitude != null
      ) {
        estimate = estimateTransit(
          prev.latitude,
          prev.longitude,
          current.latitude,
          current.longitude,
        );
      } else {
        estimate = {
          transitDistanceMeters: null,
          transitDurationMinutes: null,
          transitMode: TransitMode.WALKING,
        };
      }
    }

    if (
      current.transitDistanceMeters !== estimate.transitDistanceMeters ||
      current.transitDurationMinutes !== estimate.transitDurationMinutes ||
      current.transitMode !== estimate.transitMode
    ) {
      await prisma.itineraryItem.update({
        where: { id: current.id },
        data: {
          transitDistanceMeters: estimate.transitDistanceMeters,
          transitDurationMinutes: estimate.transitDurationMinutes,
          transitMode: estimate.transitMode,
        },
      });
    }
  }
}

export async function recalculateDayTimeLabels(
  tripDayId: string,
  prisma: PrismaService,
): Promise<void> {
  const items = await prisma.itineraryItem.findMany({
    where: { tripDayId },
    orderBy: { order: 'asc' },
  });

  if (!items.length) return;

  let currentMinutes: number | null = null;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    let startMin: number = currentMinutes != null ? currentMinutes : 9 * 60;

    if (item.timeLabel && item.timeLabel.includes('-')) {
      const parts = item.timeLabel.split('-');
      const parsed = parseTimeToMinutes(parts[0]);
      if (parsed != null) startMin = parsed;
    } else if (item.timeLabel) {
      const parsed = parseTimeToMinutes(item.timeLabel);
      if (parsed != null) startMin = parsed;
    }

    if (currentMinutes != null && startMin < currentMinutes) {
      startMin = currentMinutes;
    }

    const duration: number =
      item.duration && item.duration > 0 ? Number(item.duration) : 60;
    const endMin: number = startMin + duration;

    const newTimeLabel = `${formatMinutesToTime(startMin)} - ${formatMinutesToTime(endMin)}`;

    if (item.timeLabel !== newTimeLabel) {
      await prisma.itineraryItem.update({
        where: { id: item.id },
        data: { timeLabel: newTimeLabel },
      });
    }

    // Transit gap to next activity (use computed transit minutes or 15min default)
    const transitMin =
      item.transitDurationMinutes && item.transitDurationMinutes > 0
        ? item.transitDurationMinutes
        : 15;
    currentMinutes = endMin + transitMin;
  }
}
