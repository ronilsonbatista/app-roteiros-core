import {
  parseTimeToMinutes,
  formatMinutesToTime,
  recalculateDayTimeLabels,
  recalculateDayTransits,
} from './itinerary-schedule.util';
import { TransitMode } from '@prisma/client';

describe('ItineraryScheduleUtil', () => {
  describe('parseTimeToMinutes & formatMinutesToTime', () => {
    it('should parse HH:mm correctly', () => {
      expect(parseTimeToMinutes('09:30')).toBe(570);
      expect(parseTimeToMinutes('00:00')).toBe(0);
      expect(parseTimeToMinutes('14:45 - 16:00')).toBe(885);
      expect(parseTimeToMinutes(null)).toBeNull();
      expect(parseTimeToMinutes('invalid')).toBeNull();
    });

    it('should format minutes to HH:mm correctly', () => {
      expect(formatMinutesToTime(570)).toBe('09:30');
      expect(formatMinutesToTime(0)).toBe('00:00');
      expect(formatMinutesToTime(1439)).toBe('23:59');
    });
  });

  describe('recalculateDayTimeLabels', () => {
    it('should recalculate subsequent items when duration shifts', async () => {
      const mockItems = [
        {
          id: 'item-1',
          timeLabel: '09:00 - 10:00',
          duration: 90, // duration was updated to 90 min
          transitDurationMinutes: 15,
        },
        {
          id: 'item-2',
          timeLabel: '10:15 - 11:15',
          duration: 60,
          transitDurationMinutes: 10,
        },
      ];

      const prismaMock = {
        itineraryItem: {
          findMany: jest.fn().mockResolvedValue(mockItems),
          update: jest.fn().mockResolvedValue({}),
        },
      } as any;

      await recalculateDayTimeLabels('day-1', prismaMock);

      // item-1: 09:00 + 90 min -> 09:00 - 10:30
      expect(prismaMock.itineraryItem.update).toHaveBeenCalledWith({
        where: { id: 'item-1' },
        data: { timeLabel: '09:00 - 10:30' },
      });

      // item-2: starts at 10:30 + 15 min transit = 10:45 -> 10:45 - 11:45
      expect(prismaMock.itineraryItem.update).toHaveBeenCalledWith({
        where: { id: 'item-2' },
        data: { timeLabel: '10:45 - 11:45' },
      });
    });
  });

  describe('recalculateDayTransits', () => {
    it('should calculate transit from accommodation to day 1 item 1', async () => {
      const mockDay = {
        id: 'day-1',
        dayNumber: 1,
        trip: {
          accommodation: {
            latitude: 41.8902,
            longitude: 12.4922,
          },
        },
        items: [
          {
            id: 'item-1',
            latitude: 41.8986,
            longitude: 12.4828,
            transitDistanceMeters: null,
            transitDurationMinutes: null,
            transitMode: TransitMode.WALKING,
          },
        ],
      };

      const prismaMock = {
        tripDay: {
          findUnique: jest.fn().mockResolvedValue(mockDay),
        },
        itineraryItem: {
          update: jest.fn().mockResolvedValue({}),
        },
      } as any;

      await recalculateDayTransits('day-1', prismaMock);

      expect(prismaMock.itineraryItem.update).toHaveBeenCalledWith({
        where: { id: 'item-1' },
        data: {
          transitDistanceMeters: expect.any(Number),
          transitDurationMinutes: expect.any(Number),
          transitMode: expect.any(String),
        },
      });
    });
  });
});
