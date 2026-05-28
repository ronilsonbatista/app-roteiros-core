import { IsString, IsNotEmpty, IsOptional, IsNumber, IsEnum, IsBoolean } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ItineraryCategory } from '@prisma/client';

export class CreateItineraryItemDto {
  @ApiProperty({ example: 'Visita ao Museu do Louvre' })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiPropertyOptional({ example: 'Comprar ingressos antecipados.' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ enum: ItineraryCategory })
  @IsEnum(ItineraryCategory)
  category: ItineraryCategory;

  @ApiPropertyOptional({ example: 'Rue de Rivoli, 75001 Paris' })
  @IsOptional()
  @IsString()
  location?: string;

  @ApiPropertyOptional({ example: 'https://maps.google.com/?q=Louvre' })
  @IsOptional()
  @IsString()
  googleMapsLink?: string;

  @ApiPropertyOptional({ example: 48.8606111 })
  @IsOptional()
  @IsNumber()
  latitude?: number;

  @ApiPropertyOptional({ example: 2.337644 })
  @IsOptional()
  @IsNumber()
  longitude?: number;

  @ApiPropertyOptional({ example: '09:00' })
  @IsOptional()
  @IsString()
  timeLabel?: string;

  @ApiPropertyOptional({ example: 'Manhã' })
  @IsOptional()
  @IsString()
  period?: string;

  @ApiPropertyOptional({ example: 120, description: 'Duração em minutos' })
  @IsOptional()
  @IsNumber()
  duration?: number;

  @ApiPropertyOptional({ example: 15.5 })
  @IsOptional()
  @IsNumber()
  cost?: number;

  @ApiPropertyOptional({ example: 'EUR' })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional({ example: 'https://louvre.fr' })
  @IsOptional()
  @IsString()
  externalLink?: string;

  @ApiPropertyOptional({ example: 'Levar garrafa de água.' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiProperty({ example: 1 })
  @IsNumber()
  order: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isEditable?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isUserModified?: boolean;
}
