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

  private normalizeEmail(email: string) {
    return email.toLowerCase().trim();
  }

  async invite(userId: string, tripId: string, dto: InviteParticipantDto) {
    const trip = await this.prisma.trip.findUnique({ where: { id: tripId } });
    if (!trip) throw new NotFoundException('Trip não encontrada');
    if (trip.userId !== userId)
      throw new ForbiddenException(
        'Apenas o dono da viagem pode convidar participantes',
      );

    const email = this.normalizeEmail(dto.email);

    const existing = await this.prisma.tripParticipant.findUnique({
      where: { tripId_email: { tripId, email } },
    });
    if (existing)
      throw new BadRequestException('E-mail já convidado para esta viagem');

    const inviteToken = randomUUID();

    const participant = await this.prisma.tripParticipant.create({
      data: {
        tripId,
        email,
        invitedById: userId,
        inviteToken,
      },
    });

    this.logger.log(
      `[MOCK EMAIL] Convite enviado para ${email}. Token: ${inviteToken}`,
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
    if (this.normalizeEmail(participant.email) !== this.normalizeEmail(userEmail))
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

  /**
   * After login/signup/OTP: associate pending email invites to the user.
   * Leaves welcomeSeenAt null so Home guest modal can show.
   */
  async claimPendingInvites(userId: string, email: string) {
    const normalized = this.normalizeEmail(email);
    const result = await this.prisma.tripParticipant.updateMany({
      where: {
        email: { equals: normalized, mode: 'insensitive' },
        accepted: false,
      },
      data: {
        accepted: true,
        acceptedById: userId,
      },
    });
    if (result.count > 0) {
      this.logger.log(
        `Auto-claimed ${result.count} pending trip invite(s) for ${normalized}`,
      );
    }
    return result.count;
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

    return participations.map((p) => ({
      ...p.trip,
      participantId: p.id,
      role: p.role,
      isGuest: true,
      welcomeSeenAt: p.welcomeSeenAt,
    }));
  }

  async listPendingWelcomes(userId: string) {
    const participations = await this.prisma.tripParticipant.findMany({
      where: {
        acceptedById: userId,
        accepted: true,
        welcomeSeenAt: null,
      },
      include: {
        trip: {
          select: {
            id: true,
            title: true,
            destination: true,
            coverImage: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    return {
      items: participations.map((p) => ({
        tripId: p.tripId,
        participantId: p.id,
        role: p.role,
        isGuest: true as const,
        welcomeSeenAt: p.welcomeSeenAt,
        trip: p.trip,
      })),
    };
  }

  async markWelcomeSeen(userId: string, tripId: string) {
    const participant = await this.prisma.tripParticipant.findFirst({
      where: {
        tripId,
        acceptedById: userId,
        accepted: true,
      },
    });

    if (!participant) {
      throw new NotFoundException(
        'Participação de convidado não encontrada para esta viagem',
      );
    }

    const welcomeSeenAt = participant.welcomeSeenAt ?? new Date();
    const updated =
      participant.welcomeSeenAt != null
        ? participant
        : await this.prisma.tripParticipant.update({
            where: { id: participant.id },
            data: { welcomeSeenAt },
          });

    return {
      tripId: updated.tripId,
      participantId: updated.id,
      isGuest: true as const,
      welcomeSeenAt: updated.welcomeSeenAt,
    };
  }
}
