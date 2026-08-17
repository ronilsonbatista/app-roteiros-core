import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Query,
  Body,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
} from '@nestjs/swagger';
import { AdminTripsService } from './admin-trips.service';
import { CreateTripDto } from '../trips/dto/create-trip.dto';
import { UpdateTripDto } from '../trips/dto/update-trip.dto';
import { CreateTripDayDto } from '../trip-days/dto/create-trip-day.dto';
import { UpdateTripDayDto } from '../trip-days/dto/update-trip-day.dto';
import { CreateItineraryItemDto } from '../itinerary/dto/create-itinerary-item.dto';
import { UpdateItineraryItemDto } from '../itinerary/dto/update-itinerary-item.dto';
import { ReorderItineraryItemDto } from '../itinerary/dto/reorder-itinerary-item.dto';
import { InviteParticipantDto } from '../participants/dto/invite-participant.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role, TripStatus } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('Admin - Trips')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller('admin')
export class AdminTripsController {
  constructor(private readonly adminTripsService: AdminTripsService) {}

  // ==========================================
  // Tag: Admin - Trips
  // ==========================================

  @Get('trips')
  @ApiTags('Admin - Trips')
  @ApiOperation({ summary: 'Listar todas as viagens com paginação e filtros' })
  @ApiQuery({ name: 'userId', required: false, type: String })
  @ApiQuery({ name: 'destination', required: false, type: String })
  @ApiQuery({ name: 'status', required: false, enum: TripStatus })
  @ApiQuery({ name: 'premium', required: false, type: Boolean })
  @ApiQuery({
    name: 'startDate',
    required: false,
    type: String,
    description: 'Formato YYYY-MM-DD',
  })
  @ApiQuery({
    name: 'endDate',
    required: false,
    type: String,
    description: 'Formato YYYY-MM-DD',
  })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  findAll(
    @Query('userId') userId?: string,
    @Query('destination') destination?: string,
    @Query('status') status?: TripStatus,
    @Query('premium') premium?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const isPremium = premium !== undefined ? premium === 'true' : undefined;
    const pageNum = page ? parseInt(page, 10) : 1;
    const limitNum = limit ? parseInt(limit, 10) : 10;

    return this.adminTripsService.findAll({
      userId,
      destination,
      status,
      premium: isPremium,
      startDate,
      endDate,
      page: pageNum,
      limit: limitNum,
    });
  }

  @Get('trips/:id')
  @ApiTags('Admin - Trips')
  @ApiOperation({ summary: 'Detalhar viagem completa' })
  findOne(@Param('id') id: string) {
    return this.adminTripsService.findOne(id);
  }

  @Post('users/:userId/trips')
  @ApiTags('Admin - Trips')
  @ApiOperation({ summary: 'Criar viagem para um usuário específico' })
  create(@Param('userId') userId: string, @Body() dto: CreateTripDto) {
    return this.adminTripsService.create(userId, dto);
  }

  @Patch('trips/:id')
  @ApiTags('Admin - Trips')
  @ApiOperation({ summary: 'Editar viagem como ADMIN' })
  update(@Param('id') id: string, @Body() dto: UpdateTripDto) {
    return this.adminTripsService.update(id, dto);
  }

  @Delete('trips/:id')
  @ApiTags('Admin - Trips')
  @ApiOperation({ summary: 'Excluir viagem como ADMIN' })
  remove(@Param('id') id: string) {
    return this.adminTripsService.remove(id);
  }

  // ==========================================
  // Tag: Admin - Itinerary Editor
  // ==========================================

  @Post('trips/:tripId/days')
  @ApiTags('Admin - Itinerary Editor')
  @ApiOperation({ summary: 'Criar dia em uma viagem' })
  createDay(@Param('tripId') tripId: string, @Body() dto: CreateTripDayDto) {
    return this.adminTripsService.createDay(tripId, dto);
  }

  @Patch('trip-days/:id')
  @ApiTags('Admin - Itinerary Editor')
  @ApiOperation({ summary: 'Editar dia de viagem' })
  updateDay(@Param('id') id: string, @Body() dto: UpdateTripDayDto) {
    return this.adminTripsService.updateDay(id, dto);
  }

  @Delete('trip-days/:id')
  @ApiTags('Admin - Itinerary Editor')
  @ApiOperation({ summary: 'Excluir dia de viagem' })
  removeDay(@Param('id') id: string) {
    return this.adminTripsService.removeDay(id);
  }

  @Post('trip-days/:tripDayId/items')
  @ApiTags('Admin - Itinerary Editor')
  @ApiOperation({ summary: 'Criar item no roteiro' })
  createItineraryItem(
    @Param('tripDayId') tripDayId: string,
    @Body() dto: CreateItineraryItemDto,
  ) {
    return this.adminTripsService.createItineraryItem(tripDayId, dto);
  }

  @Patch('itinerary-items/:id')
  @ApiTags('Admin - Itinerary Editor')
  @ApiOperation({ summary: 'Editar item no roteiro' })
  updateItineraryItem(
    @Param('id') id: string,
    @Body() dto: UpdateItineraryItemDto,
  ) {
    return this.adminTripsService.updateItineraryItem(id, dto);
  }

  @Delete('itinerary-items/:id')
  @ApiTags('Admin - Itinerary Editor')
  @ApiOperation({ summary: 'Excluir item no roteiro' })
  removeItineraryItem(@Param('id') id: string) {
    return this.adminTripsService.removeItineraryItem(id);
  }

  @Patch('itinerary-items/:id/reorder')
  @ApiTags('Admin - Itinerary Editor')
  @ApiOperation({ summary: 'Reordenar item no roteiro' })
  reorderItineraryItem(
    @Param('id') id: string,
    @Body() dto: ReorderItineraryItemDto,
  ) {
    return this.adminTripsService.reorderItineraryItem(id, dto);
  }

  // ==========================================
  // Tag: Admin - Participants & Premium
  // ==========================================

  @Get('trips/:tripId/participants')
  @ApiTags('Admin - Participants & Premium')
  @ApiOperation({ summary: 'Listar participantes' })
  findParticipants(@Param('tripId') tripId: string) {
    return this.adminTripsService.findParticipants(tripId);
  }

  @Post('trips/:tripId/participants')
  @ApiTags('Admin - Participants & Premium')
  @ApiOperation({ summary: 'Adicionar/convidar participante' })
  inviteParticipant(
    @Param('tripId') tripId: string,
    @Body() dto: InviteParticipantDto,
    @CurrentUser() admin: any,
  ) {
    return this.adminTripsService.inviteParticipant(tripId, dto, admin.userId);
  }

  @Delete('trips/:tripId/participants/:participantId')
  @ApiTags('Admin - Participants & Premium')
  @ApiOperation({ summary: 'Remover participante' })
  removeParticipant(
    @Param('tripId') tripId: string,
    @Param('participantId') participantId: string,
  ) {
    return this.adminTripsService.removeParticipant(tripId, participantId);
  }

  @Patch('trips/:id/unlock-premium')
  @ApiTags('Admin - Participants & Premium')
  @ApiOperation({ summary: 'Liberar acesso premium a uma viagem' })
  unlockPremium(@Param('id') id: string) {
    return this.adminTripsService.unlockPremium(id);
  }

  @Patch('trips/:id/lock-premium')
  @ApiTags('Admin - Participants & Premium')
  @ApiOperation({ summary: 'Bloquear/remover acesso premium a uma viagem' })
  lockPremium(@Param('id') id: string) {
    return this.adminTripsService.lockPremium(id);
  }
}
