import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { TripsService } from './trips.service';
import { CreateTripDto } from './dto/create-trip.dto';
import { UpdateTripDto } from './dto/update-trip.dto';
import { CreateTripDayDto } from '../trip-days/dto/create-trip-day.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('Trips')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('trips')
export class TripsController {
  constructor(private readonly tripsService: TripsService) {}

  @Post()
  @ApiOperation({ summary: 'Criar uma nova viagem' })
  create(@CurrentUser() user: any, @Body() createTripDto: CreateTripDto) {
    return this.tripsService.create(user.userId, createTripDto);
  }

  @Get()
  @ApiOperation({ summary: 'Listar as viagens do usuário logado' })
  findAll(@CurrentUser() user: any) {
    return this.tripsService.findAll(user.userId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obter detalhes de uma viagem específica' })
  findOne(@CurrentUser() user: any, @Param('id') id: string) {
    return this.tripsService.findOne(user.userId, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Atualizar uma viagem' })
  update(@CurrentUser() user: any, @Param('id') id: string, @Body() updateTripDto: UpdateTripDto) {
    return this.tripsService.update(user.userId, id, updateTripDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Deletar uma viagem' })
  remove(@CurrentUser() user: any, @Param('id') id: string) {
    return this.tripsService.remove(user.userId, id);
  }

  @Post(':id/days')
  @ApiOperation({ summary: 'Adicionar um dia no roteiro da viagem' })
  createDay(@CurrentUser() user: any, @Param('id') tripId: string, @Body() dto: CreateTripDayDto) {
    return this.tripsService.createDay(user.userId, tripId, dto);
  }
}
