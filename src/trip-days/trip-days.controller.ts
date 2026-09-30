import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Query,
  Delete,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { TripDaysService } from './trip-days.service';
import { UpdateTripDayDto } from './dto/update-trip-day.dto';
import { CreateItineraryItemDto } from '../itinerary/dto/create-itinerary-item.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('Trip Days - App')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('trip-days')
export class TripDaysController {
  constructor(private readonly tripDaysService: TripDaysService) {}

  @Patch(':id')
  @ApiOperation({ summary: 'Atualizar dados de um dia específico da viagem' })
  update(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() updateTripDayDto: UpdateTripDayDto,
  ) {
    return this.tripDaysService.update(user, id, updateTripDayDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Deletar um dia da viagem' })
  remove(@CurrentUser() user: any, @Param('id') id: string) {
    return this.tripDaysService.remove(user, id);
  }

  @Post(':id/items')
  @ApiOperation({
    summary: 'Adicionar um novo item/atividade ao dia da viagem',
  })
  createItem(
    @CurrentUser() user: any,
    @Param('id') dayId: string,
    @Body() dto: CreateItineraryItemDto,
  ) {
    return this.tripDaysService.createItem(user, dayId, dto);
  }

  @Get(':id/meal-recommendations')
  @ApiOperation({
    summary: 'Recomendações curadas de refeições para o dia a partir da base e Places',
  })
  @ApiQuery({ name: 'period', required: false, description: 'Café, Almoço ou Jantar' })
  getMealRecommendations(
    @CurrentUser() user: any,
    @Param('id') dayId: string,
    @Query('period') period?: string,
  ) {
    return this.tripDaysService.getMealRecommendations(user, dayId, period);
  }
}
