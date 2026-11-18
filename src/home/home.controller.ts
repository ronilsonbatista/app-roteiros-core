import { Controller, Get, Header, Query } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { HomeService } from './home.service';
import {
  HomeDestinationsQueryDto,
  HomeDestinationsResponseDto,
} from './dto/home-destinations.dto';

@ApiTags('Home - Public')
@Controller('home')
export class HomeController {
  constructor(private readonly homeService: HomeService) {}

  // Sem guard: público. Se o app enviar Bearer, o token é ignorado (v1 sem personalização).
  @Get('destinations')
  @Header('Cache-Control', 'public, max-age=300')
  @ApiOperation({
    summary: 'Destinos ativos da Home (carrossel / Destinos em alta)',
    description:
      'Público (auth opcional). Retorna apenas destinos PUBLISHED/PUBLIC ordenados por sortOrder. Resposta envelopada pelo padrão do Core ({ success, data, timestamp }).',
  })
  @ApiResponse({ status: 200, type: HomeDestinationsResponseDto })
  listDestinations(@Query() query: HomeDestinationsQueryDto) {
    return this.homeService.listDestinations(query.limit);
  }
}
