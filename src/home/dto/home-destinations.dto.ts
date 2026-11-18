import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class HomeDestinationsQueryDto {
  @ApiPropertyOptional({
    description: 'Máximo de destinos retornados (1-50).',
    minimum: 1,
    maximum: 50,
    example: 12,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}

export class HomeDestinationDto {
  @ApiProperty({ example: 'capadocia', description: 'Slug estável.' })
  id!: string;

  @ApiProperty({ example: 'Capadócia', description: 'Nome em PT-BR.' })
  name!: string;

  @ApiProperty({ example: 'Turquia', nullable: true, type: String })
  country!: string | null;

  @ApiProperty({
    example: 'ChIJ…',
    description:
      'ID estável do provedor de Places (o mesmo retornado por GET /places/search). Sempre presente: destinos sem ele não são listados.',
  })
  providerPlaceId!: string;

  @ApiProperty({
    example: 'https://cdn.example/destinations/capadocia/hero.jpg',
    description: 'Hero full-bleed (HTTPS).',
  })
  imageUrl!: string;

  @ApiPropertyOptional({
    example: 'https://cdn.example/destinations/capadocia/card.jpg',
    description: 'Opcional; ausente => o app usa imageUrl.',
  })
  cardImageUrl?: string;

  @ApiProperty({ example: 0, description: 'Ordem ascendente.' })
  sortOrder!: number;

  @ApiProperty({ example: true })
  active!: boolean;
}

export class HomeDestinationsResponseDto {
  @ApiProperty({ type: [HomeDestinationDto] })
  items!: HomeDestinationDto[];
}
