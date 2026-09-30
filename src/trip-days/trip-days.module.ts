import { Module } from '@nestjs/common';
import { TripDaysService } from './trip-days.service';
import { TripDaysController } from './trip-days.controller';
import { PlacesModule } from '../places/places.module';

@Module({
  imports: [PlacesModule],
  providers: [TripDaysService],
  controllers: [TripDaysController],
  exports: [TripDaysService],
})
export class TripDaysModule {}
