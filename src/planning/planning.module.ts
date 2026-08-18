import { Module } from '@nestjs/common';
import { PlanningController } from './planning.controller';
import { PlanningService } from './planning.service';
import { PrismaModule } from '../prisma/prisma.module';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [PrismaModule, AiModule],
  controllers: [PlanningController],
  providers: [PlanningService],
  exports: [PlanningService],
})
export class PlanningModule {}
