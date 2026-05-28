import { IsNumber } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ReorderItineraryItemDto {
  @ApiProperty({ example: 2 })
  @IsNumber()
  order: number;
}
