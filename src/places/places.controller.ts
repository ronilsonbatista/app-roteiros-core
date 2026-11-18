import {
  Controller,
  Get,
  Patch,
  Query,
  Param,
  Body,
  UseGuards,
  Req,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiResponse,
} from '@nestjs/swagger';
import { PlacesService } from './places.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { EnrichPlaceDto } from './dto/enrich-place.dto';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import {
  PlacesAutocompleteQueryDto,
  PlacesAutocompleteResponseDto,
} from './dto/places-autocomplete.dto';

@ApiTags('Places - App')
@Controller()
export class PlacesController {
  constructor(private readonly placesService: PlacesService) {}

  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiTags('Places - App')
  @Get('places/search')
  @ApiOperation({ summary: 'Buscar lugares (Google Places Text Search)' })
  @ApiQuery({ name: 'query', required: true, type: String })
  searchPlaces(@Query('query') query: string) {
    if (!query) return [];
    return this.placesService.searchPlaces(query);
  }

  // Público (guest + auth). Deve ficar antes de places/:providerPlaceId.
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @ApiTags('Places - App')
  @Get('places/autocomplete')
  @ApiOperation({
    summary: 'Autocomplete de localidades (passo Onde)',
    description:
      'Público (auth opcional). Retorna cidades/regiões/países com iconUrl sempre preenchido. Resposta envelopada ({ success, data, timestamp }). Rate limit: 60 req/min por IP.',
  })
  @ApiResponse({ status: 200, type: PlacesAutocompleteResponseDto })
  autocomplete(
    @Query() query: PlacesAutocompleteQueryDto,
    @Req() req: Request,
  ) {
    const origin =
      process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get('host')}`;
    return this.placesService.autocomplete(
      query.q,
      `${origin.replace(/\/$/, '')}/static/place-icons`,
    );
  }

  @ApiTags('Places - App')
  @Get('places/:providerPlaceId')
  @ApiOperation({ summary: 'Obter detalhes de um lugar específico' })
  getPlaceDetails(@Param('providerPlaceId') providerPlaceId: string) {
    return this.placesService.getPlaceDetails(providerPlaceId);
  }

  @ApiTags('Itinerary - App')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Patch('itinerary-items/:id/place')
  @ApiOperation({
    summary: 'Enriquecer ItineraryItem com dados reais de Place',
  })
  enrichItineraryItem(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: EnrichPlaceDto,
  ) {
    return this.placesService.enrichItineraryItem(
      user.userId,
      id,
      dto.providerPlaceId,
    );
  }

  @ApiTags('Admin - Places')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @Patch('admin/base-attractions/:id/place')
  @ApiOperation({
    summary: 'Enriquecer BaseAttraction com dados reais (Admin)',
  })
  enrichBaseAttraction(@Param('id') id: string, @Body() dto: EnrichPlaceDto) {
    return this.placesService.enrichBaseAttraction(id, dto.providerPlaceId);
  }

  @ApiTags('Admin - Places')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @Patch('admin/base-restaurants/:id/place')
  @ApiOperation({
    summary: 'Enriquecer BaseRestaurant com dados reais (Admin)',
  })
  enrichBaseRestaurant(@Param('id') id: string, @Body() dto: EnrichPlaceDto) {
    return this.placesService.enrichBaseRestaurant(id, dto.providerPlaceId);
  }

  @ApiTags('Admin - Places')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @Patch('admin/itinerary-items/:id/place')
  @ApiOperation({ summary: 'Enriquecer ItineraryItem com dados reais (Admin)' })
  enrichItineraryItemAdmin(
    @Param('id') id: string,
    @Body() dto: EnrichPlaceDto,
  ) {
    return this.placesService.enrichItineraryItemAdmin(id, dto.providerPlaceId);
  }
}
