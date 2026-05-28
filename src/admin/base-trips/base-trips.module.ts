import { Module } from '@nestjs/common';
import { BaseTripsService } from './base-trips.service';
import { BaseTripsController } from './base-trips.controller';

@Module({
  providers: [BaseTripsService],
  controllers: [BaseTripsController]
})
export class BaseTripsModule {}
