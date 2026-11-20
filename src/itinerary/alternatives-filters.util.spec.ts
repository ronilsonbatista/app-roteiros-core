import { TicketStatus } from '@prisma/client';
import { AlternativesDurationBucket } from './dto/alternatives-query.dto';
import {
  AlternativeCandidate,
  applyAlternativesFilters,
  buildAlternativesFacets,
  isAccessibleFromText,
  isFreeCandidate,
  isPaidCandidate,
} from './alternatives-filters.util';

function candidate(
  overrides: Partial<AlternativeCandidate> = {},
): AlternativeCandidate {
  return {
    title: 'Coliseu',
    category: 'TOURIST_ATTRACTION',
    description: null,
    location: 'Roma',
    providerPlaceId: null,
    latitude: null,
    longitude: null,
    cost: 0,
    currency: 'EUR',
    duration: 60,
    ticketStatus: TicketStatus.FREE,
    source: 'BASE_TRIP',
    accessible: false,
    goodForKids: false,
    goodForRainyDays: false,
    ...overrides,
  };
}

describe('alternatives-filters.util', () => {
  it('treats empty/negative accessibility as not accessible', () => {
    expect(isAccessibleFromText(null)).toBe(false);
    expect(isAccessibleFromText('não')).toBe(false);
    expect(isAccessibleFromText('rampas')).toBe(true);
  });

  it('classifies free vs paid from ticketStatus and cost', () => {
    expect(isFreeCandidate(candidate({ ticketStatus: TicketStatus.FREE }))).toBe(
      true,
    );
    expect(
      isPaidCandidate(
        candidate({ ticketStatus: TicketStatus.TICKET_REQUIRED, cost: 10 }),
      ),
    ).toBe(true);
    expect(
      isPaidCandidate(candidate({ ticketStatus: TicketStatus.UNKNOWN, cost: 5 })),
    ).toBe(true);
    expect(
      isFreeCandidate(candidate({ ticketStatus: TicketStatus.UNKNOWN, cost: 0 })),
    ).toBe(true);
  });

  it('builds facets and applies duration/location/q filters', () => {
    const items = [
      candidate({
        title: 'Coliseu',
        duration: 90,
        location: 'Coliseu',
        category: 'TOURIST_ATTRACTION',
      }),
      candidate({
        title: 'Museus Vaticanos',
        duration: 180,
        location: 'Vaticano',
        category: 'MUSEUM',
        goodForRainyDays: true,
      }),
    ];

    const facets = buildAlternativesFacets(items);
    expect(facets.categories.map((c) => c.value).sort()).toEqual([
      'MUSEUM',
      'TOURIST_ATTRACTION',
    ]);
    expect(
      facets.durations.some(
        (d) => d.value === AlternativesDurationBucket.OVER_120 && d.count === 1,
      ),
    ).toBe(true);

    const filtered = applyAlternativesFilters(items, {
      duration: AlternativesDurationBucket.OVER_120,
      location: 'vaticano',
      q: 'museu',
      goodForRainyDays: true,
    });
    expect(filtered.map((i) => i.title)).toEqual(['Museus Vaticanos']);
  });
});
