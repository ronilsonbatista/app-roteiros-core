import { Module } from '@nestjs/common';
import { TripDaysService } from './trip-days.service';
import { TripDaysController } from './trip-days.controller';

@Module({
  providers: [TripDaysService],
  controllers: [TripDaysController]
})
export class TripDaysModule {}
