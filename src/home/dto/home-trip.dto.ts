import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { HomeTipDto } from './home-tips.dto';

export class HomeTripDestinationDto {
  @ApiProperty({ example: 'Roma' })
  name!: string;

  @ApiPropertyOptional({ example: 'Roma', nullable: true, type: String })
  city?: string | null;

  @ApiPropertyOptional({ example: 'Itália', nullable: true, type: String })
  country?: string | null;

  @ApiPropertyOptional({
    example: 'ChIJ…',
    nullable: true,
    type: String,
    description: 'Google Places id when known (from planning destinations).',
  })
  providerPlaceId?: string | null;

  @ApiPropertyOptional({
    example: 'https://cdn.example/roma/hero.jpg',
    nullable: true,
    type: String,
  })
  coverImageUrl?: string | null;

  @ApiPropertyOptional({
    example: '2026-07-25',
    nullable: true,
    type: String,
    description: 'YYYY-MM-DD when available.',
  })
  arrivalDate?: string | null;

  @ApiPropertyOptional({
    example: '2026-07-28',
    nullable: true,
    type: String,
  })
  departureDate?: string | null;

  @ApiProperty({ example: 0 })
  order!: number;

  @ApiProperty({
    example: 'roma',
    description: 'Normalized key for GET /home/tips?destinationKey=',
  })
  destinationKey!: string;
}

export class HomeTripDayDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ example: 1 })
  dayNumber!: number;

  @ApiPropertyOptional({
    example: '2026-07-25',
    nullable: true,
    type: String,
    description: 'YYYY-MM-DD',
  })
  date!: string | null;

  @ApiPropertyOptional({
    example: 'Roma',
    nullable: true,
    type: String,
    description: 'Destination label for the day when resolvable.',
  })
  destination!: string | null;

  @ApiPropertyOptional({ example: 'Chegada e Centro Histórico', nullable: true, type: String })
  title!: string | null;

  @ApiProperty({
    example: 4,
    description: 'Count of itinerary items (structure only; no pin leakage).',
  })
  itemCount!: number;
}

export class HomeTripCrmDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ example: 'Viagem para Roma & Paris' })
  title!: string;

  @ApiProperty({ type: [HomeTripDestinationDto] })
  destinations!: HomeTripDestinationDto[];

  @ApiPropertyOptional({
    example: 'https://cdn.example/roma/hero.jpg',
    nullable: true,
    type: String,
  })
  coverImageUrl!: string | null;

  @ApiPropertyOptional({
    example: '2026-07-25',
    nullable: true,
    type: String,
    description: 'YYYY-MM-DD — start of trip (countdown target when no arrivalDateTime).',
  })
  startDate!: string | null;

  @ApiPropertyOptional({
    example: '2026-07-28',
    nullable: true,
    type: String,
  })
  endDate!: string | null;

  @ApiPropertyOptional({
    example: '2026-07-25T14:00:00.000Z',
    nullable: true,
    type: String,
    description: 'ISO datetime for countdown when arrival time is known.',
  })
  arrivalDateTime!: string | null;

  @ApiProperty({ type: [HomeTripDayDto], description: 'All days (structure of upcoming travel).' })
  days!: HomeTripDayDto[];

  @ApiProperty({
    example: true,
    description: 'Always true for this endpoint (premiumUnlockedAt set).',
  })
  premiumUnlocked!: boolean;

  @ApiProperty({ example: 'ACTIVE' })
  status!: string;

  @ApiProperty({
    type: [HomeTipDto],
    description:
      'Tips for trip destinations (max 3 per destination). Same shape as GET /home/tips.',
  })
  tips!: HomeTipDto[];
}

export class HomeTripResponseDto {
  @ApiPropertyOptional({
    type: HomeTripCrmDto,
    nullable: true,
    description:
      'Next paid upcoming/ongoing trip, or null → app shows discovery Home (catalog destinations).',
  })
  trip!: HomeTripCrmDto | null;
}
