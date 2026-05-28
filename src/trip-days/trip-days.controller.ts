import { Controller, Post, Body, Patch, Param, Delete, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { TripDaysService } from './trip-days.service';
import { UpdateTripDayDto } from './dto/update-trip-day.dto';
import { CreateItineraryItemDto } from '../itinerary/dto/create-itinerary-item.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('Trip Days')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('trip-days')
export class TripDaysController {
  constructor(private readonly tripDaysService: TripDaysService) {}

  @Patch(':id')
  @ApiOperation({ summary: 'Atualizar dados de um dia específico da viagem' })
  update(@CurrentUser() user: any, @Param('id') id: string, @Body() updateTripDayDto: UpdateTripDayDto) {
    return this.tripDaysService.update(user.userId, id, updateTripDayDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Deletar um dia da viagem' })
  remove(@CurrentUser() user: any, @Param('id') id: string) {
    return this.tripDaysService.remove(user.userId, id);
  }

  @Post(':id/items')
  @ApiOperation({ summary: 'Adicionar um novo item/atividade ao dia da viagem' })
  createItem(@CurrentUser() user: any, @Param('id') dayId: string, @Body() dto: CreateItineraryItemDto) {
    return this.tripDaysService.createItem(user.userId, dayId, dto);
  }
}
