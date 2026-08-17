import {
  Controller,
  Post,
  Get,
  Delete,
  Param,
  Body,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { ParticipantsService } from './participants.service';
import { InviteParticipantDto } from './dto/invite-participant.dto';
import { AcceptInviteDto } from './dto/accept-invite.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('Participants - App')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class ParticipantsController {
  constructor(private readonly participantsService: ParticipantsService) {}

  @Post('trips/:tripId/participants')
  @ApiOperation({ summary: 'Convidar um participante para a viagem' })
  inviteParticipant(
    @CurrentUser() user: any,
    @Param('tripId') tripId: string,
    @Body() dto: InviteParticipantDto,
  ) {
    return this.participantsService.invite(user.userId, tripId, dto);
  }

  @Get('trips/:tripId/participants')
  @ApiOperation({ summary: 'Listar participantes de uma viagem' })
  findAllParticipants(
    @CurrentUser() user: any,
    @Param('tripId') tripId: string,
  ) {
    return this.participantsService.findAllByTrip(user.userId, tripId);
  }

  @Delete('trips/:tripId/participants/:participantId')
  @ApiOperation({ summary: 'Remover participante de uma viagem' })
  removeParticipant(
    @CurrentUser() user: any,
    @Param('tripId') tripId: string,
    @Param('participantId') participantId: string,
  ) {
    return this.participantsService.remove(user.userId, tripId, participantId);
  }

  @Post('trip-invites/accept')
  @ApiOperation({ summary: 'Aceitar um convite de viagem' })
  acceptInvite(@CurrentUser() user: any, @Body() dto: AcceptInviteDto) {
    return this.participantsService.acceptInvite(user.userId, user.email, dto);
  }

  @Get('users/me/shared-trips')
  @ApiOperation({ summary: 'Listar viagens compartilhadas com o usuário' })
  getSharedTrips(@CurrentUser() user: any) {
    return this.participantsService.getSharedTrips(user.userId);
  }
}
