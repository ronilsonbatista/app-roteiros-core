import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { ItineraryCategory } from '@prisma/client';

export enum AlternativesDurationBucket {
  UNDER_60 = 'UNDER_60',
  FROM_60_TO_120 = 'FROM_60_TO_120',
  OVER_120 = 'OVER_120',
}

function toOptionalBoolean(value: unknown): boolean | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true' || normalized === '1') return true;
    if (normalized === 'false' || normalized === '0') return false;
  }
  return undefined;
}

/**
 * Query filters for `GET /itinerary-items/:id/alternatives`.
 * Matches the paid-trip "Filtrar por" sheet (categoria, duração, localização,
 * valor Grátis/Pago, características).
 */
export class AlternativesQueryDto {
  @ApiPropertyOptional({ enum: ItineraryCategory })
  @IsOptional()
  @IsEnum(ItineraryCategory)
  category?: ItineraryCategory;

  @ApiPropertyOptional({
    enum: AlternativesDurationBucket,
    description: 'UNDER_60 | FROM_60_TO_120 | OVER_120',
  })
  @IsOptional()
  @IsEnum(AlternativesDurationBucket)
  duration?: AlternativesDurationBucket;

  @ApiPropertyOptional({
    description: 'Exact location label from facets (or substring match)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  location?: string;

  @ApiPropertyOptional({
    description: 'Include free (Grátis) options. Combine with paid.',
  })
  @IsOptional()
  @Transform(({ value }) => toOptionalBoolean(value))
  @IsBoolean()
  free?: boolean;

  @ApiPropertyOptional({
    description: 'Include paid (Pago) options. Combine with free.',
  })
  @IsOptional()
  @Transform(({ value }) => toOptionalBoolean(value))
  @IsBoolean()
  paid?: boolean;

  @ApiPropertyOptional({ description: 'Acessível' })
  @IsOptional()
  @Transform(({ value }) => toOptionalBoolean(value))
  @IsBoolean()
  accessible?: boolean;

  @ApiPropertyOptional({ description: 'Ideal para dias de chuva' })
  @IsOptional()
  @Transform(({ value }) => toOptionalBoolean(value))
  @IsBoolean()
  goodForRainyDays?: boolean;

  @ApiPropertyOptional({ description: 'Bom para crianças' })
  @IsOptional()
  @Transform(({ value }) => toOptionalBoolean(value))
  @IsBoolean()
  goodForKids?: boolean;

  @ApiPropertyOptional({
    description: 'Search by activity title (Ou busque por atividade)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  q?: string;
}
