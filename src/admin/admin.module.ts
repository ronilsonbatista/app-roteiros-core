import { Module } from '@nestjs/common';
import { AdminService } from './admin.service';
import { AdminController } from './admin.controller';
import { BaseTripsModule } from './base-trips/base-trips.module';
import { AdminTripsController } from './admin-trips.controller';
import { AdminTripsService } from './admin-trips.service';

@Module({
  providers: [AdminService, AdminTripsService],
  controllers: [AdminController, AdminTripsController],
  imports: [BaseTripsModule]
})
export class AdminModule {}
