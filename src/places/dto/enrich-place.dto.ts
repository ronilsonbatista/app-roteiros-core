import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class EnrichPlaceDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  providerPlaceId: string;
}
