import { ItineraryCategory, TicketStatus } from '@prisma/client';
import { AlternativesDurationBucket } from './dto/alternatives-query.dto';

export type AlternativeCandidate = {
  title: string;
  category: ItineraryCategory | string;
  description: string | null;
  location: string | null;
  providerPlaceId: string | null;
  latitude: number | null;
  longitude: number | null;
  cost: number;
  currency: string;
  duration: number | null;
  ticketStatus: TicketStatus;
  source: string;
  rating?: number;
  userRatingsTotal?: number;
  googleMapsUri?: string;
  accessible: boolean;
  goodForKids: boolean;
  goodForRainyDays: boolean;
  imageUrl?: string | null;
};

export type AlternativesFacets = {
  categories: Array<{ value: string; label: string; count: number }>;
  durations: Array<{ value: AlternativesDurationBucket; label: string; count: number }>;
  locations: Array<{ value: string; label: string; count: number }>;
};

const CATEGORY_LABELS: Record<string, string> = {
  TOURIST_ATTRACTION: 'Atração',
  MUSEUM: 'Museu',
  RESTAURANT: 'Restaurante',
  CAFE: 'Café',
  BAR: 'Bar',
  BEACH: 'Praia',
  PARK: 'Parque',
  SHOPPING: 'Compras',
  EXPERIENCE: 'Experiência',
  TRANSPORT: 'Transporte',
  EVENT: 'Evento',
  NIGHTLIFE: 'Vida noturna',
  FREE_ACTIVITY: 'Atividade gratuita',
  PAID_ACTIVITY: 'Atividade paga',
};

const DURATION_META: Array<{
  value: AlternativesDurationBucket;
  label: string;
  matches: (minutes: number | null) => boolean;
}> = [
  {
    value: AlternativesDurationBucket.UNDER_60,
    label: 'Até 1 hora',
    matches: (m) => m != null && m <= 60,
  },
  {
    value: AlternativesDurationBucket.FROM_60_TO_120,
    label: '1 a 2 horas',
    matches: (m) => m != null && m > 60 && m <= 120,
  },
  {
    value: AlternativesDurationBucket.OVER_120,
    label: 'Mais de 2 horas',
    matches: (m) => m != null && m > 120,
  },
];

const NEGATIVE_ACCESSIBILITY = new Set([
  'nao',
  'não',
  'no',
  'none',
  'n/a',
  'na',
  'inacessivel',
  'inacessível',
  'inaccessible',
  'false',
  '0',
]);

export function categoryLabel(category: string): string {
  return CATEGORY_LABELS[category] || category;
}

export function isAccessibleFromText(raw: string | null | undefined): boolean {
  if (raw == null) return false;
  const value = raw.trim().toLowerCase();
  if (!value) return false;
  if (NEGATIVE_ACCESSIBILITY.has(value)) return false;
  return true;
}

export function isFreeCandidate(item: AlternativeCandidate): boolean {
  if (item.ticketStatus === TicketStatus.FREE) return true;
  if (item.ticketStatus === TicketStatus.TICKET_REQUIRED) return false;
  return !(item.cost > 0);
}

export function isPaidCandidate(item: AlternativeCandidate): boolean {
  if (item.ticketStatus === TicketStatus.TICKET_REQUIRED) return true;
  if (item.ticketStatus === TicketStatus.FREE) return false;
  return item.cost > 0;
}

export function matchesDurationBucket(
  duration: number | null,
  bucket: AlternativesDurationBucket,
): boolean {
  const meta = DURATION_META.find((d) => d.value === bucket);
  return meta ? meta.matches(duration) : true;
}

export function buildAlternativesFacets(
  items: AlternativeCandidate[],
): AlternativesFacets {
  const categoryCounts = new Map<string, number>();
  const locationCounts = new Map<string, number>();
  const durationCounts = new Map<AlternativesDurationBucket, number>();

  for (const item of items) {
    const cat = String(item.category);
    categoryCounts.set(cat, (categoryCounts.get(cat) || 0) + 1);

    const loc = (item.location || '').trim();
    if (loc) {
      locationCounts.set(loc, (locationCounts.get(loc) || 0) + 1);
    }

    for (const bucket of DURATION_META) {
      if (bucket.matches(item.duration)) {
        durationCounts.set(
          bucket.value,
          (durationCounts.get(bucket.value) || 0) + 1,
        );
      }
    }
  }

  return {
    categories: [...categoryCounts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([value, count]) => ({
        value,
        label: categoryLabel(value),
        count,
      })),
    durations: DURATION_META.map((bucket) => ({
      value: bucket.value,
      label: bucket.label,
      count: durationCounts.get(bucket.value) || 0,
    })).filter((bucket) => bucket.count > 0),
    locations: [...locationCounts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 40)
      .map(([value, count]) => ({ value, label: value, count })),
  };
}

export type AlternativesFilterInput = {
  category?: string;
  duration?: AlternativesDurationBucket;
  location?: string;
  free?: boolean;
  paid?: boolean;
  accessible?: boolean;
  goodForRainyDays?: boolean;
  goodForKids?: boolean;
  q?: string;
};

export function applyAlternativesFilters(
  items: AlternativeCandidate[],
  filters: AlternativesFilterInput,
): AlternativeCandidate[] {
  const category = filters.category?.trim();
  const location = filters.location?.trim().toLowerCase();
  const q = filters.q?.trim().toLowerCase();

  const wantFree = filters.free === true;
  const wantPaid = filters.paid === true;
  const valueFilterActive = wantFree || wantPaid;

  return items.filter((item) => {
    if (category && String(item.category) !== category) return false;

    if (
      filters.duration &&
      !matchesDurationBucket(item.duration, filters.duration)
    ) {
      return false;
    }

    if (location) {
      const itemLoc = (item.location || '').trim().toLowerCase();
      if (!itemLoc || !itemLoc.includes(location)) return false;
    }

    if (valueFilterActive) {
      const freeOk = wantFree && isFreeCandidate(item);
      const paidOk = wantPaid && isPaidCandidate(item);
      if (!freeOk && !paidOk) return false;
    }

    if (filters.accessible === true && !item.accessible) return false;
    if (filters.goodForRainyDays === true && !item.goodForRainyDays) {
      return false;
    }
    if (filters.goodForKids === true && !item.goodForKids) return false;

    if (q) {
      const hay = `${item.title} ${item.description || ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }

    return true;
  });
}

export { DURATION_META };
