import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  IsEnum,
  IsArray,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BaseTripStatus, BaseTripVisibility } from '@prisma/client';

export class CreateBaseTripDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  destination: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  country?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  region?: string;

  @ApiProperty()
  @IsNumber()
  numberOfDays: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  profile?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  shortDescription?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  fullDescription?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  coverImage?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  bestTime?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  climate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  averageBudget?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  language?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @ApiPropertyOptional({ enum: BaseTripStatus, default: BaseTripStatus.DRAFT })
  @IsOptional()
  @IsEnum(BaseTripStatus)
  status?: BaseTripStatus;

  @ApiPropertyOptional({
    enum: BaseTripVisibility,
    default: BaseTripVisibility.PRIVATE,
  })
  @IsOptional()
  @IsEnum(BaseTripVisibility)
  visibility?: BaseTripVisibility;
}
