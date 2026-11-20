import { IsString, IsNotEmpty, IsOptional, IsNumber } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class PinMealDto {
  @ApiProperty({ example: 'Trattoria Da Enzo al 29' })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiPropertyOptional({ example: 'Cozinha tradicional romana' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: 'Via dei Vascellari, 29, 00153 Roma' })
  @IsOptional()
  @IsString()
  location?: string;

  @ApiPropertyOptional({ example: 'ChIJ...placeId' })
  @IsOptional()
  @IsString()
  providerPlaceId?: string;

  @ApiPropertyOptional({ example: 41.8878 })
  @IsOptional()
  @IsNumber()
  latitude?: number;

  @ApiPropertyOptional({ example: 12.4776 })
  @IsOptional()
  @IsNumber()
  longitude?: number;

  @ApiPropertyOptional({ example: 35.0 })
  @IsOptional()
  @IsNumber()
  cost?: number;

  @ApiPropertyOptional({ example: 'EUR' })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional({ example: 'Carbonara clássica e cacio e pepe recomendadas' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ example: 'https://maps.google.com/?q=Trattoria+Da+Enzo' })
  @IsOptional()
  @IsString()
  googleMapsLink?: string;

  /** Restaurant photo URL for timeline selected card (stored in externalLink). */
  @ApiPropertyOptional({ example: 'https://lh3.googleusercontent.com/...' })
  @IsOptional()
  @IsString()
  imageUrl?: string;

  /** Display price range ($, $$, …) — encoded into notes metadata with dish. */
  @ApiPropertyOptional({ example: '$$' })
  @IsOptional()
  @IsString()
  priceRange?: string;

  @ApiPropertyOptional({ example: 4.7 })
  @IsOptional()
  @IsNumber()
  rating?: number;
}
