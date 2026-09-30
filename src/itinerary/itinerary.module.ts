import { Module } from '@nestjs/common';
import { ItineraryService } from './itinerary.service';
import { ItineraryController } from './itinerary.controller';
import { PlacesModule } from '../places/places.module';

@Module({
  imports: [PlacesModule],
  providers: [ItineraryService],
  controllers: [ItineraryController],
  exports: [ItineraryService],
})
export class ItineraryModule {}
