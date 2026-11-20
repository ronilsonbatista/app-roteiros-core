import { ImageBankStatus } from '@prisma/client';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { PUBLISHED_CITY_IMAGE_COUNT } from '../image-bank.constants';

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function trimString({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

function emptyToNull({ value }: { value: unknown }): unknown {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

export class PublicListQueryDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 200, default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;

  @ApiPropertyOptional({ minimum: 0, default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;
}

export class AdminListQueryDto extends PublicListQueryDto {
  @ApiPropertyOptional({ enum: ImageBankStatus })
  @IsOptional()
  @IsEnum(ImageBankStatus)
  status?: ImageBankStatus;
}

export class CreateDestinationDto {
  @ApiProperty({ example: 'Rio de Janeiro' })
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  @ApiProperty({ example: 'Brasil' })
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  country!: string;

  @ApiPropertyOptional({ example: 'rio-de-janeiro' })
  @Transform(trimString)
  @IsOptional()
  @IsString()
  @Matches(SLUG, {
    message: 'slug deve usar letras minúsculas, números e hífen',
  })
  @MaxLength(80)
  slug?: string;

  @ApiPropertyOptional({ example: 'Sudeste' })
  @Transform(emptyToNull)
  @IsOptional()
  @IsString()
  @MaxLength(80)
  region?: string | null;

  @ApiPropertyOptional()
  @Transform(emptyToNull)
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  summary?: string | null;

  @ApiPropertyOptional({
    description: 'BaseTrip (roteiro da Home) com o mesmo lugar, se já existir.',
  })
  @IsOptional()
  @IsUUID()
  baseTripId?: string | null;
}

export class UpdateDestinationDto {
  @ApiPropertyOptional()
  @Transform(trimString)
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional()
  @Transform(trimString)
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  country?: string;

  @ApiPropertyOptional()
  @Transform(trimString)
  @IsOptional()
  @IsString()
  @Matches(SLUG, {
    message: 'slug deve usar letras minúsculas, números e hífen',
  })
  @MaxLength(80)
  slug?: string;

  @ApiPropertyOptional({ nullable: true })
  @Transform(emptyToNull)
  @IsOptional()
  @IsString()
  @MaxLength(80)
  region?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @Transform(emptyToNull)
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  summary?: string | null;

  @ApiPropertyOptional({ enum: ImageBankStatus })
  @IsOptional()
  @IsEnum(ImageBankStatus)
  status?: ImageBankStatus;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsUUID()
  baseTripId?: string | null;
}

export class CreateCityDto {
  @ApiProperty({ example: 'Rio de Janeiro' })
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  @ApiPropertyOptional({ example: 'rio-de-janeiro' })
  @Transform(trimString)
  @IsOptional()
  @IsString()
  @Matches(SLUG, {
    message: 'slug deve usar letras minúsculas, números e hífen',
  })
  @MaxLength(80)
  slug?: string;

  @ApiPropertyOptional()
  @Transform(emptyToNull)
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  summary?: string | null;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

export class UpdateCityDto {
  @ApiPropertyOptional()
  @Transform(trimString)
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional()
  @Transform(trimString)
  @IsOptional()
  @IsString()
  @Matches(SLUG, {
    message: 'slug deve usar letras minúsculas, números e hífen',
  })
  @MaxLength(80)
  slug?: string;

  @ApiPropertyOptional({ nullable: true })
  @Transform(emptyToNull)
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  summary?: string | null;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @ApiPropertyOptional({
    enum: ImageBankStatus,
    description:
      'PUBLISHED exige exatamente 5 imagens originais. DRAFT aceita menos.',
  })
  @IsOptional()
  @IsEnum(ImageBankStatus)
  status?: ImageBankStatus;
}

export class UploadSpotImageDto {
  @ApiProperty({ example: 'Cristo Redentor' })
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  spotName!: string;

  @ApiProperty({ example: 'Cristo Redentor no Corcovado, ao entardecer' })
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  altText!: string;

  @ApiProperty({
    minimum: 1,
    maximum: PUBLISHED_CITY_IMAGE_COUNT,
    description: 'Posição da foto entre as 5 da cidade (1 a 5).',
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(PUBLISHED_CITY_IMAGE_COUNT)
  sortOrder!: number;
}

export class UpdateSpotImageDto {
  @ApiPropertyOptional()
  @Transform(trimString)
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  spotName?: string;

  @ApiPropertyOptional()
  @Transform(trimString)
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  altText?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: PUBLISHED_CITY_IMAGE_COUNT })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(PUBLISHED_CITY_IMAGE_COUNT)
  sortOrder?: number;
}
