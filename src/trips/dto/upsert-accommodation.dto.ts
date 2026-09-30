import { IsString, IsNotEmpty, IsOptional, IsNumber } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UpsertAccommodationDto {
  @ApiProperty({ example: 'Hotel Roma Centro' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({ example: 'Via del Corso, 100, Roma' })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional({ example: 'Centro Storico' })
  @IsOptional()
  @IsString()
  neighborhood?: string;

  @ApiPropertyOptional({ example: '00186' })
  @IsOptional()
  @IsString()
  zipCode?: string;

  @ApiPropertyOptional({ example: 41.8902 })
  @IsOptional()
  @IsNumber()
  latitude?: number;

  @ApiPropertyOptional({ example: 12.4922 })
  @IsOptional()
  @IsNumber()
  longitude?: number;

  @ApiPropertyOptional({ example: 'ChIJ...googlePlaceId' })
  @IsOptional()
  @IsString()
  providerPlaceId?: string;

  @ApiPropertyOptional({ example: '2026-07-25T14:00:00.000Z' })
  @IsOptional()
  @IsString()
  checkInDateTime?: string;

  @ApiPropertyOptional({ example: '2026-07-28T11:00:00.000Z' })
  @IsOptional()
  @IsString()
  checkOutDateTime?: string;

  @ApiPropertyOptional({ example: '2026-07-25' })
  @IsOptional()
  @IsString()
  checkInDate?: string;

  @ApiPropertyOptional({ example: '14:00' })
  @IsOptional()
  @IsString()
  checkInTime?: string;

  @ApiPropertyOptional({ example: '2026-07-28' })
  @IsOptional()
  @IsString()
  checkOutDate?: string;

  @ApiPropertyOptional({ example: '11:00' })
  @IsOptional()
  @IsString()
  checkOutTime?: string;
}
