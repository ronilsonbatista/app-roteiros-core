import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class PlacesHotelsAutocompleteQueryDto {
  @ApiProperty({
    description: 'Nome digitado da hospedagem (mín. 2 caracteres úteis; máx. 100).',
    example: 'Ho',
  })
  @IsString()
  @MaxLength(100)
  q!: string;

  @ApiPropertyOptional({
    description:
      'Latitude do destino da viagem para viesar resultados (círculo com lng + radiusMeters).',
    example: 41.9028,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat?: number;

  @ApiPropertyOptional({
    description:
      'Longitude do destino da viagem para viesar resultados (círculo com lat + radiusMeters).',
    example: 12.4964,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  lng?: number;

  @ApiPropertyOptional({
    description:
      'Raio do locationBias em metros (padrão 50000; máx. 50000). Só aplica com lat+lng.',
    example: 50000,
    default: 50000,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(50000)
  radiusMeters?: number;
}

export class PlaceHotelAutocompleteItemDto {
  @ApiProperty({
    example: 'ChIJ…',
    description:
      'Mesmo ID de GET /places/:providerPlaceId e de POST /trips/:id/accommodation (providerPlaceId).',
  })
  providerPlaceId!: string;

  @ApiProperty({ example: 'Hotel Diana Roof Garden' })
  name!: string;

  @ApiProperty({
    example: 'Roma, Itália',
    description:
      'Linha secundária do autocomplete (cidade/região). Endereço completo vem em GET /places/:providerPlaceId.',
  })
  subtitle!: string;
}

export class PlacesHotelsAutocompleteResponseDto {
  @ApiProperty({ type: [PlaceHotelAutocompleteItemDto] })
  items!: PlaceHotelAutocompleteItemDto[];
}
