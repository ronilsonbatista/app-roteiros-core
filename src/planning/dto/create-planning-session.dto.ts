import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsInt,
  Min,
  Max,
  IsArray,
  ValidateNested,
  IsEnum,
} from 'class-validator';
import { Type } from 'class-transformer';
import { TravelStyle, BudgetLevel } from '@prisma/client';
import { PlanningInterest } from '../enums/planning-interests.enum';
import {
  PlanningDestinationDto,
  PlanningTravelersDto,
  PlanningActivityWindowDto,
} from './update-planning-session.dto';

export class CreatePlanningSessionDto {
  @ApiPropertyOptional({
    description: 'Versão do contrato do questionário',
    example: 1,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  answersVersion?: number;

  @ApiPropertyOptional({
    description: 'Etapa inicial do questionário (1..6)',
    example: 1,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(6)
  initialStep?: number;

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
  })
  @IsOptional()
  @IsArray()
  @IsEnum(PlanningInterest, { each: true })
  interests?: PlanningInterest[];

  @ApiPropertyOptional({ type: PlanningActivityWindowDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => PlanningActivityWindowDto)
  activityHours?: PlanningActivityWindowDto;

  @ApiPropertyOptional({ type: PlanningActivityWindowDto, deprecated: true })
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
