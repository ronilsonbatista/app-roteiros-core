import { ApiProperty } from '@nestjs/swagger';
import { GuestJourneyStatus, TravelStyle, BudgetLevel } from '@prisma/client';
import {
  PlanningDestinationDto,
  PlanningTravelersDto,
  PlanningActivityWindowDto,
} from './update-planning-session.dto';

export class PlanningSessionResponseDto {
  @ApiProperty({ example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' })
  id: string;

  @ApiProperty({ enum: GuestJourneyStatus, example: GuestJourneyStatus.COLLECTING })
  status: GuestJourneyStatus;

  @ApiProperty({ example: 1 })
  answersVersion: number;

  @ApiProperty({ example: 1 })
  currentStep: number;

  @ApiProperty({ type: [PlanningDestinationDto], required: false })
  destinations?: PlanningDestinationDto[];

  @ApiProperty({ type: PlanningTravelersDto, required: false })
  travelers?: PlanningTravelersDto;

  @ApiProperty({ type: [String], required: false })
  interests?: string[];

  @ApiProperty({ type: PlanningActivityWindowDto, required: false })
  activityHours?: PlanningActivityWindowDto;

  @ApiProperty({ enum: TravelStyle, required: false })
  travelStyle?: TravelStyle;

  @ApiProperty({ enum: BudgetLevel, required: false })
  budgetLevel?: BudgetLevel;

  @ApiProperty({ example: '2026-08-25T15:00:00.000Z' })
  expiresAt: Date;

  @ApiProperty({ example: '2026-08-18T15:00:00.000Z' })
  createdAt: Date;

  @ApiProperty({ example: '2026-08-18T15:00:00.000Z' })
  updatedAt: Date;
}

export class CreatePlanningSessionResponseDto extends PlanningSessionResponseDto {
  @ApiProperty({
    description:
      'Chave secreta de alta entropia gerada UMA ÚNICA VEZ. Deve ser armazenada com segurança no dispositivo móvel e enviada via header X-Guest-Token.',
    example: '8f9a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a2b3c4d5e6f7a8b9c0d1e2f3a',
  })
  guestToken: string;
}
