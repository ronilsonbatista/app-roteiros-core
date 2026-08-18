import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsInt, Min, Max } from 'class-validator';

export class CreatePlanningSessionDto {
  @ApiPropertyOptional({
    description: 'Versão do contrato do questionário',
    example: 1,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  answersVersion?: number;

  @ApiPropertyOptional({
    description: 'Etapa inicial do questionário (1..6)',
    example: 1,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(6)
  initialStep?: number;
}
