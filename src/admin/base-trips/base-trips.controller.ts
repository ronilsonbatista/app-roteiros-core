import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { BaseTripsService } from './base-trips.service';
import { CreateBaseTripDto } from './dto/create-base-trip.dto';
import { UpdateBaseTripDto } from './dto/update-base-trip.dto';
import { CreateBaseTripDayDto } from './dto/create-base-trip-day.dto';
import { CreateBaseAttractionDto } from './dto/create-base-attraction.dto';
import { UpdateBaseAttractionDto } from './dto/update-base-attraction.dto';
import { CreateBaseRestaurantDto } from './dto/create-base-restaurant.dto';
import { UpdateBaseRestaurantDto } from './dto/update-base-restaurant.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';

@ApiTags('Admin Base Trips')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller('admin')
export class BaseTripsController {
  constructor(private readonly baseTripsService: BaseTripsService) {}

  @Post('base-trips')
  @ApiOperation({ summary: 'Criar nova Base Trip' })
  createBaseTrip(@CurrentUser() admin: any, @Body() dto: CreateBaseTripDto) {
    return this.baseTripsService.createBaseTrip(admin.userId, dto);
  }

  @Get('base-trips')
  @ApiOperation({ summary: 'Listar todas as Base Trips' })
  findAllBaseTrips() {
    return this.baseTripsService.findAllBaseTrips();
  }

  @Get('base-trips/:id')
  @ApiOperation({ summary: 'Detalhar uma Base Trip' })
  findOneBaseTrip(@Param('id') id: string) {
    return this.baseTripsService.findOneBaseTrip(id);
  }

  @Patch('base-trips/:id')
  @ApiOperation({ summary: 'Atualizar uma Base Trip' })
  updateBaseTrip(@Param('id') id: string, @Body() dto: UpdateBaseTripDto) {
    return this.baseTripsService.updateBaseTrip(id, dto);
  }

  @Delete('base-trips/:id')
  @ApiOperation({ summary: 'Deletar uma Base Trip' })
  removeBaseTrip(@Param('id') id: string) {
    return this.baseTripsService.removeBaseTrip(id);
  }

  @Post('base-trips/:id/days')
  @ApiOperation({ summary: 'Criar dia para a Base Trip' })
  createBaseTripDay(@Param('id') id: string, @Body() dto: CreateBaseTripDayDto) {
    return this.baseTripsService.createBaseTripDay(id, dto);
  }

  @Post('base-trip-days/:id/attractions')
  @ApiOperation({ summary: 'Criar atração em um dia base' })
  createBaseAttraction(@Param('id') id: string, @Body() dto: CreateBaseAttractionDto) {
    return this.baseTripsService.createBaseAttraction(id, dto);
  }

  @Patch('base-attractions/:id')
  @ApiOperation({ summary: 'Atualizar atração base' })
  updateBaseAttraction(@Param('id') id: string, @Body() dto: UpdateBaseAttractionDto) {
    return this.baseTripsService.updateBaseAttraction(id, dto);
  }

  @Delete('base-attractions/:id')
  @ApiOperation({ summary: 'Remover atração base' })
  removeBaseAttraction(@Param('id') id: string) {
    return this.baseTripsService.removeBaseAttraction(id);
  }

  @Post('base-trip-days/:id/restaurants')
  @ApiOperation({ summary: 'Criar restaurante em um dia base' })
  createBaseRestaurant(@Param('id') id: string, @Body() dto: CreateBaseRestaurantDto) {
    return this.baseTripsService.createBaseRestaurant(id, dto);
  }

  @Patch('base-restaurants/:id')
  @ApiOperation({ summary: 'Atualizar restaurante base' })
  updateBaseRestaurant(@Param('id') id: string, @Body() dto: UpdateBaseRestaurantDto) {
    return this.baseTripsService.updateBaseRestaurant(id, dto);
  }

  @Delete('base-restaurants/:id')
  @ApiOperation({ summary: 'Remover restaurante base' })
  removeBaseRestaurant(@Param('id') id: string) {
    return this.baseTripsService.removeBaseRestaurant(id);
  }
}
