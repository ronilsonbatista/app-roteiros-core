import {
  Controller,
  Get,
  Header,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { HomeService } from './home.service';
import {
  HomeDestinationsQueryDto,
  HomeDestinationsResponseDto,
} from './dto/home-destinations.dto';
import { HomeTipsQueryDto, HomeTipsResponseDto } from './dto/home-tips.dto';
import { HomeTripResponseDto } from './dto/home-trip.dto';

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

  @Get('trip')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiTags('Home - App')
  @ApiOperation({
    summary: 'Home CRM da próxima viagem paga',
    description:
      'Bearer. Retorna a próxima viagem com premiumUnlockedAt (paga) ainda vigente/futura: destinos, datas, estrutura de dias e dicas (máx. 3 por destino). `trip: null` → app mostra Home de descoberta. Envelope { success, data, timestamp }.',
  })
  @ApiResponse({ status: 200, type: HomeTripResponseDto })
  getTripHome(@CurrentUser() user: { userId: string }) {
    return this.homeService.getTripHome(user.userId);
  }

  @Get('tips')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiTags('Home - App')
  @ApiOperation({
    summary: 'Dicas por destino (máx. 3)',
    description:
      'Bearer. Core owns tip storage. Query destinationKey (preferido) ou destination. Placeholder/seed até job Grok a partir de pins do roteiro. Envelope { success, data, timestamp }.',
  })
  @ApiResponse({ status: 200, type: HomeTipsResponseDto })
  listTips(@Query() query: HomeTipsQueryDto) {
    return this.homeService.listTips({
      destinationKey: query.destinationKey,
      destination: query.destination,
      limit: query.limit,
    });
  }
}
