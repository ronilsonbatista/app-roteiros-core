import { IsString, IsNotEmpty, IsOptional, IsNumber, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ItineraryCategory, TicketStatus } from '@prisma/client';

export class SubstituteItemDto {
  @ApiProperty({ example: 'Galeria Borghese' })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiPropertyOptional({ example: 'Visita à coleção de esculturas e pinturas renascentistas' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ enum: ItineraryCategory })
  @IsOptional()
  @IsEnum(ItineraryCategory)
  category?: ItineraryCategory;

  @ApiPropertyOptional({ example: 'Piazzale Scipione Borghese, 5, 00197 Roma' })
  @IsOptional()
  @IsString()
  location?: string;

  @ApiPropertyOptional({ example: 'ChIJ...placeId' })
  @IsOptional()
  @IsString()
  providerPlaceId?: string;

  @ApiPropertyOptional({ example: 41.9142 })
  @IsOptional()
  @IsNumber()
  latitude?: number;

  @ApiPropertyOptional({ example: 12.4921 })
  @IsOptional()
  @IsNumber()
  longitude?: number;

  @ApiPropertyOptional({ example: 15.0 })
  @IsOptional()
  @IsNumber()
  cost?: number;

  @ApiPropertyOptional({ example: 'EUR' })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional({ example: 90 })
  @IsOptional()
  @IsNumber()
  duration?: number;

  @ApiPropertyOptional({ enum: TicketStatus })
  @IsOptional()
  @IsEnum(TicketStatus)
  ticketStatus?: TicketStatus;
}
