import {
  IsString,
  IsOptional,
  IsArray,
  IsEnum,
  IsBoolean,
  IsInt,
  Min,
  MaxLength,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { TravelStyle, BudgetLevel } from '@prisma/client';

export class CreateUserTravelProfileDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  bio?: string;

  @ApiPropertyOptional({ enum: TravelStyle, isArray: true })
  @IsOptional()
  @IsArray()
  @IsEnum(TravelStyle, { each: true })
  preferredStyles?: TravelStyle[];

  @ApiPropertyOptional({ enum: BudgetLevel })
  @IsOptional()
  @IsEnum(BudgetLevel)
  budgetLevel?: BudgetLevel;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  favoriteCountries?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  favoriteCities?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  preferredLanguages?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  foodPreferences?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  accessibilityNeeds?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  travelInterests?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  travelCompanions?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  avoidedDestinations?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  preferredClimate?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  bucketListDestinations?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  prefersNightlife?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  prefersNature?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  prefersGastronomy?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  prefersMuseums?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  prefersShopping?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  prefersRelaxing?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  averageTripDuration?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  passportCountry?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  instagramHandle?: string;
}
