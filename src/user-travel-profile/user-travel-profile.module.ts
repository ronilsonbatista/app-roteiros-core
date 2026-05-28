import { Module } from '@nestjs/common';
import { UserTravelProfileService } from './user-travel-profile.service';
import { UserTravelProfileController } from './user-travel-profile.controller';

@Module({
  providers: [UserTravelProfileService],
  controllers: [UserTravelProfileController]
})
export class UserTravelProfileModule {}
