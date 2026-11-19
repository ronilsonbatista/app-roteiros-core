import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class PlaceHotelSearchItemDto {
  @ApiProperty({ example: 'ChIJ…' })
  providerPlaceId!: string;

  @ApiProperty({ example: 'Hotel Diana Roof Garden' })
  name!: string;

  @ApiProperty({ example: 'Via Torino, 94, 00184 Roma RM, Itália' })
  formattedAddress!: string;

  @ApiPropertyOptional({ example: 41.901 })
  latitude?: number;

  @ApiPropertyOptional({ example: 12.495 })
  longitude?: number;

  @ApiPropertyOptional({ example: 4.5 })
  rating?: number;

  @ApiProperty({ type: [String], example: ['lodging', 'hotel'] })
  types!: string[];
}

export class PlacesHotelsSearchResponseDto {
  @ApiProperty({ type: [PlaceHotelSearchItemDto] })
  items!: PlaceHotelSearchItemDto[];
}
