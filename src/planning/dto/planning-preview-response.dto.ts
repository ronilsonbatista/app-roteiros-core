import { ApiProperty } from '@nestjs/swagger';
import { GuestJourneyStatus, ItineraryCategory, ProductType } from '@prisma/client';

export class PlanningPreviewSummaryDto {
  @ApiProperty({ type: [Object], example: [{ name: 'Roma', arrivalDate: '2026-07-25', departureDate: '2026-07-28' }] })
  destinations: any[];

  @ApiProperty({ required: false, example: '2026-07-25' })
  startDate?: string;

  @ApiProperty({ required: false, example: '2026-07-28' })
  endDate?: string;

  @ApiProperty({ example: 4 })
  totalDays: number;

  @ApiProperty({ required: false, nullable: true, example: 'https://images.unsplash.com/photo-roma' })
  coverImageUrl?: string;
}

export class PlanningPreviewPolicyDto {
  @ApiProperty({ example: 1, description: 'Número de dias totalmente liberados no preview' })
  visibleDayCount: number;

  @ApiProperty({ example: 10, description: 'Delay em segundos para exibição automática do Paywall no cliente' })
  autoPaywallDelaySeconds: number;
}

export class PlanningVisibleActivityDto {
  @ApiProperty({ example: 'Coliseu' })
  title: string;

  @ApiProperty({ required: false, example: 'Visita guiada ao monumento histórico' })
  description?: string;

  @ApiProperty({ enum: ItineraryCategory, example: ItineraryCategory.TOURIST_ATTRACTION })
  category: ItineraryCategory;

  @ApiProperty({ required: false, example: 'Manhã' })
  period?: string;

  @ApiProperty({ example: 20.0 })
  cost: number;

  @ApiProperty({ example: 1 })
  order: number;

  @ApiProperty({ required: false, example: 'Piazza del Colosseo, 1, Roma' })
  location?: string;

  @ApiProperty({ required: false, example: 41.8902 })
  latitude?: number;

  @ApiProperty({ required: false, example: 12.4922 })
  longitude?: number;

  @ApiProperty({ required: false, example: 'ChIJ3S-g4DlhLxMRw6s2Z2U187A' })
  providerPlaceId?: string;

  @ApiProperty({ required: false, example: 'https://images.unsplash.com/photo-coliseu' })
  imageUrl?: string;

  @ApiProperty({ required: false, example: 'https://tickets.colosseo.it' })
  reservationUrl?: string;

  @ApiProperty({ required: false, example: 'https://tickets.colosseo.it' })
  ticketUrl?: string;

  @ApiProperty({ example: 'BASE_ATTRACTION', description: 'Origem comprovada do item (BASE_TRIP, BASE_ATTRACTION, BASE_RESTAURANT, PLACES ou AI)' })
  sourceType: string;

  @ApiProperty({ required: false, nullable: true, example: 'base-attr-123' })
  sourceId?: string;
}

export class PlanningVisibleDayDto {
  @ApiProperty({ example: 1 })
  dayNumber: number;

  @ApiProperty({ required: false, example: '2026-07-25' })
  date?: string;

  @ApiProperty({ example: 'Roma' })
  destination: string;

  @ApiProperty({ example: 'Dia 1: Chegada em Roma' })
  title: string;

  @ApiProperty({ required: false, example: 'Primeiro dia de passeios' })
  description?: string;

  @ApiProperty({ type: [PlanningVisibleActivityDto] })
  activities: PlanningVisibleActivityDto[];
}

export class PlanningLockedDayDto {
  @ApiProperty({ example: 2 })
  dayNumber: number;

  @ApiProperty({ required: false, example: '2026-07-26' })
  date?: string;

  @ApiProperty({ example: 'Roma' })
  destination: string;

  @ApiProperty({ example: 'Dia 2' })
  title: string;

  @ApiProperty({ example: true })
  locked: boolean;
}

export class PlanningUnlockOfferDto {
  @ApiProperty({ required: false, example: 'prod-uuid-123' })
  productId?: string;

  @ApiProperty({ enum: ProductType, example: ProductType.ITINERARY_FULL_ACCESS })
  code: ProductType;

  @ApiProperty({ example: 'Roteiro Completo 2GO' })
  name: string;

  @ApiProperty({ example: 19.99 })
  price: number;

  @ApiProperty({ example: 'BRL' })
  currency: string;

  @ApiProperty({ example: true })
  available: boolean;
}

export class PlanningPreviewResponseDto {
  @ApiProperty({ example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' })
  id: string;

  @ApiProperty({ enum: GuestJourneyStatus, example: GuestJourneyStatus.PREVIEW_READY })
  status: GuestJourneyStatus;

  @ApiProperty({ type: PlanningPreviewSummaryDto })
  summary: PlanningPreviewSummaryDto;

  @ApiProperty({ type: PlanningPreviewPolicyDto })
  previewPolicy: PlanningPreviewPolicyDto;

  @ApiProperty({ type: [PlanningVisibleDayDto] })
  visibleDays: PlanningVisibleDayDto[];

  @ApiProperty({ type: [PlanningLockedDayDto] })
  lockedDays: PlanningLockedDayDto[];

  @ApiProperty({ type: PlanningUnlockOfferDto })
  unlockOffer: PlanningUnlockOfferDto;
}
