import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, MaxLength } from 'class-validator';

export class PlacesAutocompleteQueryDto {
  @ApiProperty({
    description: 'Texto digitado (mín. 2 caracteres úteis; máx. 100).',
    example: 'Roma',
  })
  @IsString()
  @MaxLength(100)
  q!: string;
}

export class PlaceAutocompleteItemDto {
  @ApiProperty({
    example: 'ChIJ…',
    description:
      'Mesmo ID de GET /places/search e de GET /home/destinations (providerPlaceId).',
  })
  providerPlaceId!: string;

  @ApiProperty({ example: 'Roma' })
  name!: string;

  @ApiProperty({ example: 'Lácio, Itália', description: 'Linha secundária.' })
  subtitle!: string;

  @ApiProperty({
    example: 'https://api.example/static/place-icons/city.svg',
    description:
      'Thumb/ícone sempre preenchido: imagem do destino curado da Home quando o ID casa; senão ícone padrão do produto por tipo (city, region, country, place).',
  })
  iconUrl!: string;

  @ApiPropertyOptional({
    description:
      'Não retornado pelo autocomplete; use GET /places/:providerPlaceId para coordenadas.',
  })
  latitude?: number;

  @ApiPropertyOptional()
  longitude?: number;
}

export class PlacesAutocompleteResponseDto {
  @ApiProperty({ type: [PlaceAutocompleteItemDto] })
  items!: PlaceAutocompleteItemDto[];
}
