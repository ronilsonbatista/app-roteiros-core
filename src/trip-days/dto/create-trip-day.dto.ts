import { IsNumber, IsOptional, IsDateString, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateTripDayDto {
  @ApiPropertyOptional({ example: '2027-01-10T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  date?: string;

  @ApiProperty({ example: 1 })
  @IsNumber()
  dayNumber: number;

  @ApiPropertyOptional({ example: 'Chegada e Check-in' })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional({ example: 'Dia livre para explorar os arredores do hotel.' })
  @IsOptional()
  @IsString()
  description?: string;
}
