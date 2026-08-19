import { ApiProperty } from '@nestjs/swagger';
import { GuestJourneyStatus } from '@prisma/client';

export class ClaimGuestJourneyResponseDto {
  @ApiProperty({
    example: '123e4567-e89b-12d3-a456-426614174000',
    description: 'UUID da jornada de planejamento reivindicada',
  })
  journeyId: string;

  @ApiProperty({
    example: '987f6543-e21b-12d3-a456-426614174000',
    description: 'UUID da Trip criada e materializada no banco de dados',
  })
  tripId: string;

  @ApiProperty({
    enum: GuestJourneyStatus,
    example: GuestJourneyStatus.CLAIMED,
    description: 'Novo status da jornada de planejamento após o claim',
  })
  status: GuestJourneyStatus;

  @ApiProperty({
    example: 'CHECKOUT',
    description: 'Próxima ação esperada no fluxo do cliente',
  })
  nextAction: string;
}
