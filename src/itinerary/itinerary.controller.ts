import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { ItineraryService } from './itinerary.service';
import { UpdateItineraryItemDto } from './dto/update-itinerary-item.dto';
import { ReorderItineraryItemDto } from './dto/reorder-itinerary-item.dto';
import { SubstituteItemDto } from './dto/substitute-item.dto';
import { PinMealDto } from './dto/pin-meal.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('Itinerary - App')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('itinerary-items')
export class ItineraryController {
  constructor(private readonly itineraryService: ItineraryService) {}

  @Get(':id')
  @ApiOperation({ summary: 'Obter detalhes verificados de um item do roteiro' })
  findOne(@CurrentUser() user: any, @Param('id') id: string) {
    return this.itineraryService.findOne(user, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Atualizar um item do roteiro (duração recalcula horários seguintes)' })
  update(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() updateItineraryItemDto: UpdateItineraryItemDto,
  ) {
    return this.itineraryService.update(
      user,
      id,
      updateItineraryItemDto,
    );
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Deletar um item do roteiro' })
  remove(@CurrentUser() user: any, @Param('id') id: string) {
    return this.itineraryService.remove(user, id);
  }

  @Patch(':id/reorder')
  @ApiOperation({ summary: 'Reordenar um item no roteiro' })
  reorder(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: ReorderItineraryItemDto,
  ) {
    return this.itineraryService.reorder(user, id, dto);
  }

  @Get(':id/alternatives')
  @ApiOperation({ summary: 'Listar alternativas para substituição com cota de trocas' })
  getAlternatives(@CurrentUser() user: any, @Param('id') id: string) {
    return this.itineraryService.getAlternatives(user, id);
  }

  @Post(':id/substitute')
  @ApiOperation({ summary: 'Substituir item do roteiro consumindo cota de trocas' })
  substitute(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: SubstituteItemDto,
  ) {
    return this.itineraryService.substitute(user, id, dto);
  }

  @Patch(':id/pin-meal')
  @ApiOperation({ summary: 'Fixar recomendação de restaurante em um item de refeição' })
  pinMeal(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: PinMealDto,
  ) {
    return this.itineraryService.pinMeal(user, id, dto);
  }
}
