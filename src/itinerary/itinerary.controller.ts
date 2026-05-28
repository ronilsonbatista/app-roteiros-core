import { Controller, Body, Patch, Param, Delete, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { ItineraryService } from './itinerary.service';
import { UpdateItineraryItemDto } from './dto/update-itinerary-item.dto';
import { ReorderItineraryItemDto } from './dto/reorder-itinerary-item.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('Itinerary Items')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('itinerary-items')
export class ItineraryController {
  constructor(private readonly itineraryService: ItineraryService) {}

  @Patch(':id')
  @ApiOperation({ summary: 'Atualizar um item do roteiro' })
  update(@CurrentUser() user: any, @Param('id') id: string, @Body() updateItineraryItemDto: UpdateItineraryItemDto) {
    return this.itineraryService.update(user.userId, id, updateItineraryItemDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Deletar um item do roteiro' })
  remove(@CurrentUser() user: any, @Param('id') id: string) {
    return this.itineraryService.remove(user.userId, id);
  }

  @Patch(':id/reorder')
  @ApiOperation({ summary: 'Reordenar um item no roteiro' })
  reorder(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: ReorderItineraryItemDto) {
    return this.itineraryService.reorder(user.userId, id, dto);
  }
}
