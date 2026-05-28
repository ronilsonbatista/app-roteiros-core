import { IsString, IsNotEmpty, IsOptional, IsDateString, IsEnum, IsObject } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TripStatus } from '@prisma/client';

export class CreateTripDto {
  @ApiProperty({ example: 'Viagem para Paris' })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiProperty({ example: 'Paris, França' })
  @IsString()
  @IsNotEmpty()
  destination: string;

  @ApiPropertyOptional({ example: 'https://exemplo.com/imagem.jpg' })
  @IsOptional()
  @IsString()
  coverImage?: string;

  @ApiPropertyOptional({ example: '2027-01-10T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ example: '2027-01-20T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({ enum: TripStatus, default: TripStatus.DRAFT })
  @IsOptional()
  @IsEnum(TripStatus)
  status?: TripStatus;

  @ApiPropertyOptional({ example: { focus: 'cultural', pace: 'relaxed' } })
  @IsOptional()
  @IsObject()
  preferences?: Record<string, any>;
}
