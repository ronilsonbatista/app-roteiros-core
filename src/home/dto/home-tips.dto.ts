import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

export class HomeTipsQueryDto {
  @ApiPropertyOptional({
    description:
      'Normalized destination key (e.g. roma). Prefer this over free-text destination.',
    example: 'roma',
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  destinationKey?: string;

  @ApiPropertyOptional({
    description:
      'Destination display name; normalized server-side when destinationKey omitted.',
    example: 'Roma',
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  destination?: string;

  @ApiPropertyOptional({
    description: 'Max tips (1–3). Default 3.',
    minimum: 1,
    maximum: 3,
    example: 3,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(3)
  limit?: number;
}

export class HomeTipDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ example: 'roma' })
  destinationKey!: string;

  @ApiProperty({ example: 'Roma' })
  destinationName!: string;

  @ApiProperty({ example: 'Diversifique as formas de pagamento' })
  title!: string;

  @ApiProperty({
    example:
      'Leve uma combinação de dinheiro em espécie, cartão de débito internacional e cartão de crédito tradicional.',
  })
  body!: string;

  @ApiProperty({ example: 0 })
  sortOrder!: number;

  @ApiProperty({
    example: 'PLACEHOLDER',
    description: 'PLACEHOLDER | ITINERARY_PIN | GROK',
  })
  source!: string;

  @ApiPropertyOptional({ nullable: true, type: String })
  providerPlaceId?: string | null;
}

export class HomeTipsResponseDto {
  @ApiProperty({ type: [HomeTipDto] })
  items!: HomeTipDto[];
}
