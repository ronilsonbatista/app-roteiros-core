import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  IsInt,
  Min,
  Max,
  IsArray,
  ValidateNested,
  IsEnum,
  Matches,
} from 'class-validator';
import { Type } from 'class-transformer';
import { TravelStyle, BudgetLevel } from '@prisma/client';
import { PlanningInterest } from '../enums/planning-interests.enum';

export class PlanningDestinationDto {
  @ApiPropertyOptional({ example: 'ChIJaX7xOX1gLxMRFC23l00vM-Q' })
  @IsOptional()
  @IsString()
  providerPlaceId?: string;

  @ApiPropertyOptional({ example: 'Roma' })
  @IsString()
  name: string;

  @ApiPropertyOptional({ example: 'Roma' })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional({ example: 'Itália' })
  @IsOptional()
  @IsString()
  country?: string;

  @ApiPropertyOptional({ example: 'https://images.unsplash.com/photo-roma' })
  @IsOptional()
  @IsString()
  coverImage?: string;

  @ApiPropertyOptional({ example: '2026-07-25' })
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'arrivalDate deve estar no formato YYYY-MM-DD',
  })
  arrivalDate: string;

  @ApiPropertyOptional({ example: '11:00' })
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, {
    message: 'arrivalTime deve estar no formato HH:mm',
  })
  arrivalTime: string;

  @ApiPropertyOptional({ example: '2026-07-28' })
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'departureDate deve estar no formato YYYY-MM-DD',
  })
  departureDate: string;

  @ApiPropertyOptional({ example: '19:00' })
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, {
    message: 'departureTime deve estar no formato HH:mm',
  })
  departureTime: string;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  order?: number;
}

export class PlanningTravelersDto {
  @ApiPropertyOptional({ example: 2 })
  @IsInt()
  @Min(0)
  adults: number;

  @ApiPropertyOptional({ example: 1 })
  @IsInt()
  @Min(0)
  children: number;

  @ApiPropertyOptional({ example: 0 })
  @IsInt()
  @Min(0)
  elders: number;
}

export class PlanningActivityWindowDto {
  @ApiPropertyOptional({ example: '09:00' })
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, {
    message: 'startTime deve estar no formato HH:mm',
  })
  startTime: string;

  @ApiPropertyOptional({ example: '18:30' })
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, {
    message: 'endTime deve estar no formato HH:mm',
  })
  endTime: string;
}

export class UpdatePlanningSessionDto {
  @ApiPropertyOptional({ example: 2 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(6)
  currentStep?: number;

  @ApiPropertyOptional({ type: [PlanningDestinationDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PlanningDestinationDto)
  destinations?: PlanningDestinationDto[];

  @ApiPropertyOptional({ type: PlanningTravelersDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => PlanningTravelersDto)
  travelers?: PlanningTravelersDto;

  @ApiPropertyOptional({
    enum: PlanningInterest,
    isArray: true,
    example: [
      PlanningInterest.GASTRONOMY,
      PlanningInterest.ARCHITECTURE,
      PlanningInterest.NATURE,
    ],
  })
  @IsOptional()
  @IsArray()
  @IsEnum(PlanningInterest, { each: true })
  interests?: PlanningInterest[];

  @ApiPropertyOptional({ type: PlanningActivityWindowDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => PlanningActivityWindowDto)
  activityWindow?: PlanningActivityWindowDto;

  @ApiPropertyOptional({ enum: TravelStyle, example: TravelStyle.COMFORT })
  @IsOptional()
  @IsEnum(TravelStyle)
  travelStyle?: TravelStyle;

  @ApiPropertyOptional({ enum: BudgetLevel, example: BudgetLevel.MEDIUM })
  @IsOptional()
  @IsEnum(BudgetLevel)
  budgetLevel?: BudgetLevel;
}
