import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { InviteParticipantDto } from './dto/invite-participant.dto';
import { AcceptInviteDto } from './dto/accept-invite.dto';
import { randomUUID } from 'crypto';

@Injectable()
export class ParticipantsService {
  private readonly logger = new Logger(ParticipantsService.name);

  constructor(private prisma: PrismaService) {}

  async invite(userId: string, tripId: string, dto: InviteParticipantDto) {
    const trip = await this.prisma.trip.findUnique({ where: { id: tripId } });
    if (!trip) throw new NotFoundException('Trip não encontrada');
    if (trip.userId !== userId)
      throw new ForbiddenException(
        'Apenas o dono da viagem pode convidar participantes',
      );

    const existing = await this.prisma.tripParticipant.findUnique({
      where: { tripId_email: { tripId, email: dto.email } },
    });
    if (existing)
      throw new BadRequestException('E-mail já convidado para esta viagem');

    const inviteToken = randomUUID();

    const participant = await this.prisma.tripParticipant.create({
      data: {
        tripId,
        email: dto.email,
        invitedById: userId,
        inviteToken,
      },
    });

    this.logger.log(
      `[MOCK EMAIL] Convite enviado para ${dto.email}. Token: ${inviteToken}`,
    );

    return {
      message: 'Convite enviado com sucesso',
      participantId: participant.id,
    };
  }

  async findAllByTrip(userId: string, tripId: string) {
    const trip = await this.prisma.trip.findUnique({ where: { id: tripId } });
    if (!trip) throw new NotFoundException('Trip não encontrada');
    if (trip.userId !== userId)
      throw new ForbiddenException(
        'Apenas o dono da viagem pode listar participantes',
      );

    return this.prisma.tripParticipant.findMany({
      where: { tripId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async remove(userId: string, tripId: string, participantId: string) {
    const trip = await this.prisma.trip.findUnique({ where: { id: tripId } });
    if (!trip) throw new NotFoundException('Trip não encontrada');
    if (trip.userId !== userId)
      throw new ForbiddenException(
        'Apenas o dono da viagem pode remover participantes',
      );

    const participant = await this.prisma.tripParticipant.findUnique({
      where: { id: participantId },
    });
    if (!participant || participant.tripId !== tripId) {
      throw new NotFoundException('Participante não encontrado');
    }

    return this.prisma.tripParticipant.delete({ where: { id: participantId } });
  }

  async acceptInvite(userId: string, userEmail: string, dto: AcceptInviteDto) {
    const participant = await this.prisma.tripParticipant.findUnique({
      where: { inviteToken: dto.inviteToken },
      include: { trip: true },
    });

    if (!participant)
      throw new NotFoundException('Convite inválido ou não encontrado');
    if (participant.accepted)
      throw new BadRequestException('Este convite já foi aceito');
    if (participant.email !== userEmail)
      throw new ForbiddenException('Este convite não pertence a este e-mail');

    await this.prisma.tripParticipant.update({
      where: { id: participant.id },
      data: {
        accepted: true,
        acceptedById: userId,
      },
    });

    return {
      message: 'Convite aceito com sucesso',
      tripId: participant.tripId,
    };
  }

  async getSharedTrips(userId: string) {
    const participations = await this.prisma.tripParticipant.findMany({
      where: {
        acceptedById: userId,
        accepted: true,
      },
      include: {
        trip: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return participations.map((p) => p.trip);
  }
}
