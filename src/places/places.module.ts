import { Module } from '@nestjs/common';
import { PlacesService } from './places.service';
import { PlacesController } from './places.controller';
import { HttpModule } from '@nestjs/axios';
import { GooglePlacesProvider } from './providers/google-places.provider';

@Module({
  imports: [HttpModule],
  providers: [PlacesService, GooglePlacesProvider],
  controllers: [PlacesController],
  exports: [PlacesService],
})
export class PlacesModule {}
