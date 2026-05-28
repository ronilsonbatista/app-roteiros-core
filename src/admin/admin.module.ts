import { Module } from '@nestjs/common';
import { AdminService } from './admin.service';
import { AdminController } from './admin.controller';
import { BaseTripsModule } from './base-trips/base-trips.module';

@Module({
  providers: [AdminService],
  controllers: [AdminController],
  imports: [BaseTripsModule]
})
export class AdminModule {}
