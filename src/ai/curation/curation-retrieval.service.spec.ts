import { Test, TestingModule } from '@nestjs/testing';
import { CurationRetrievalService } from './curation-retrieval.service';
import { PrismaService } from '../../prisma/prisma.service';
import { BaseTripStatus } from '@prisma/client';

describe('CurationRetrievalService (Phase G2 Audit & Retrieval)', () => {
  let service: CurationRetrievalService;
  let prisma: PrismaService;

  const mockPrismaService = {
    baseTrip: {
      findMany: jest.fn(),
    },
    baseAttraction: {
      findMany: jest.fn(),
    },
    baseRestaurant: {
      findMany: jest.fn(),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CurationRetrievalService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<CurationRetrievalService>(CurationRetrievalService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  it('should return NONE coverage when no destinations are provided', async () => {
    const result = await service.retrieveCuratedContext({
      destinations: [],
    });

    expect(result.overallCoverage).toEqual('NONE');
    expect(result.destinations).toHaveLength(0);
  });

  it('should return NONE coverage without exception when database has no matching BaseTrip or Attractions', async () => {
    mockPrismaService.baseTrip.findMany.mockResolvedValue([]);
    mockPrismaService.baseAttraction.findMany.mockResolvedValue([]);
    mockPrismaService.baseRestaurant.findMany.mockResolvedValue([]);

    const result = await service.retrieveCuratedContext({
      destinations: [{ name: 'Tequucigalpa' }],
    });

    expect(result.overallCoverage).toEqual('NONE');
    expect(result.destinations).toHaveLength(1);
    expect(result.destinations[0].coverage).toEqual('NONE');
    expect(result.destinations[0].bestBaseTrip).toBeUndefined();
    expect(result.destinations[0].attractions).toHaveLength(0);
  });

  it('should return STRONG coverage when a published BaseTrip matches exact destination with high score', async () => {
    const mockBaseTrip = {
      id: 'trip-roma-123',
      title: 'Roma Clássica e Romântica',
      destination: 'Roma',
      city: 'Roma',
      country: 'Itália',
      numberOfDays: 4,
      tags: ['arte', 'gastronomia', 'historia'],
      status: BaseTripStatus.PUBLISHED,
      days: [
        {
          dayNumber: 1,
          attractions: [
            {
              id: 'attr-1',
              name: 'Coliseu',
              category: 'TOURIST_ATTRACTION',
              goodForKids: true,
            },
          ],
          restaurants: [
            {
              id: 'rest-1',
              name: 'Trattoria da Enzo',
              rating: 4.8,
            },
          ],
        },
      ],
    };

    mockPrismaService.baseTrip.findMany.mockResolvedValue([mockBaseTrip]);

    const result = await service.retrieveCuratedContext({
      destinations: [{ name: 'Roma', city: 'Roma' }],
      numberOfDays: 4,
      interests: ['arte', 'gastronomia'],
    });

    expect(result.overallCoverage).toEqual('STRONG');
    expect(result.destinations).toHaveLength(1);

    const destContext = result.destinations[0];
    expect(destContext.destinationName).toEqual('Roma');
    expect(destContext.coverage).toEqual('STRONG');
    expect(destContext.bestBaseTrip).toBeDefined();
    expect(destContext.bestBaseTrip?.baseTrip.id).toEqual('trip-roma-123');
    expect(destContext.bestBaseTrip?.score).toBeGreaterThanOrEqual(50);
    expect(destContext.attractions).toHaveLength(1);
    expect(destContext.restaurants).toHaveLength(1);
  });

  it('should isolate multi-destination contexts (Roma vs Paris)', async () => {
    const mockRomaTrip = {
      id: 'roma-trip-1',
      title: 'Descubra Roma',
      destination: 'Roma',
      status: BaseTripStatus.PUBLISHED,
      numberOfDays: 3,
      tags: ['arte'],
      days: [
        {
          dayNumber: 1,
          attractions: [{ id: 'attr-roma', name: 'Coliseu' }],
          restaurants: [{ id: 'rest-roma', name: 'Trattoria Roma' }],
        },
      ],
    };

    const mockParisTrip = {
      id: 'paris-trip-1',
      title: 'Descubra Paris',
      destination: 'Paris',
      status: BaseTripStatus.PUBLISHED,
      numberOfDays: 3,
      tags: ['arte'],
      days: [
        {
          dayNumber: 1,
          attractions: [{ id: 'attr-paris', name: 'Torre Eiffel' }],
          restaurants: [{ id: 'rest-paris', name: 'Bistrot Paris' }],
        },
      ],
    };

    mockPrismaService.baseTrip.findMany.mockImplementation((args: any) => {
      const search = args.where.OR[0].destination.contains;
      if (search === 'Roma') return Promise.resolve([mockRomaTrip]);
      if (search === 'Paris') return Promise.resolve([mockParisTrip]);
      return Promise.resolve([]);
    });

    const result = await service.retrieveCuratedContext({
      destinations: [{ name: 'Roma' }, { name: 'Paris' }],
      numberOfDays: 3,
      interests: ['arte'],
    });

    expect(result.overallCoverage).toEqual('STRONG');
    expect(result.destinations).toHaveLength(2);

    const romaCtx = result.destinations[0];
    expect(romaCtx.destinationName).toEqual('Roma');
    expect(romaCtx.bestBaseTrip?.baseTrip.id).toEqual('roma-trip-1');
    expect(romaCtx.attractions[0].attraction.name).toEqual('Coliseu');

    const parisCtx = result.destinations[1];
    expect(parisCtx.destinationName).toEqual('Paris');
    expect(parisCtx.bestBaseTrip?.baseTrip.id).toEqual('paris-trip-1');
    expect(parisCtx.attractions[0].attraction.name).toEqual('Torre Eiffel');
  });

  it('should return PARTIAL coverage when standalone attractions exist without a full BaseTrip', async () => {
    mockPrismaService.baseTrip.findMany.mockResolvedValue([]); // 0 BaseTrips
    mockPrismaService.baseAttraction.findMany.mockResolvedValue([
      {
        id: 'attr-florenca-1',
        name: 'Galleria degli Uffizi',
        category: 'MUSEUM',
        goodForKids: true,
      },
    ]);
    mockPrismaService.baseRestaurant.findMany.mockResolvedValue([]);

    const result = await service.retrieveCuratedContext({
      destinations: [{ name: 'Florença' }],
      interests: ['arte'],
    });

    expect(result.overallCoverage).toEqual('PARTIAL');
    expect(result.destinations[0].coverage).toEqual('PARTIAL');
    expect(result.destinations[0].bestBaseTrip).toBeUndefined();
    expect(result.destinations[0].attractions).toHaveLength(1);
    expect(result.destinations[0].attractions[0].attraction.name).toEqual(
      'Galleria degli Uffizi',
    );
  });
});
