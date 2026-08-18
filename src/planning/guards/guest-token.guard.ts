import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import * as crypto from 'crypto';

@Injectable()
export class GuestTokenGuard implements CanActivate {
  constructor(private prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const guestToken = request.headers['x-guest-token'];
    const journeyId = request.params.id;

    if (!guestToken || typeof guestToken !== 'string' || !journeyId) {
      throw new UnauthorizedException({
        statusCode: 401,
        code: 'PLANNING_JOURNEY_INVALID_TOKEN',
        message: 'Token de jornada anônima ausente ou inválido',
      });
    }

    const tokenHash = crypto
      .createHash('sha256')
      .update(guestToken)
      .digest('hex');

    const journey = await this.prisma.guestJourney.findUnique({
      where: { id: journeyId },
    });

    // Uniform response for non-existing journey or invalid token hash to prevent enumeration
    if (!journey || journey.guestTokenHash !== tokenHash) {
      throw new NotFoundException({
        statusCode: 404,
        code: 'PLANNING_JOURNEY_NOT_FOUND',
        message: 'Jornada de planejamento não encontrada ou autorização inválida',
      });
    }

    // Expiration check
    if (journey.expiresAt && new Date() > new Date(journey.expiresAt)) {
      throw new UnauthorizedException({
        statusCode: 401,
        code: 'PLANNING_JOURNEY_EXPIRED',
        message: 'Sessão de planejamento expirada',
      });
    }

    request.guestJourney = journey;
    return true;
  }
}
