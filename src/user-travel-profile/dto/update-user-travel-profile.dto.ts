import { PartialType } from '@nestjs/swagger';
import { CreateUserTravelProfileDto } from './create-user-travel-profile.dto';

export class UpdateUserTravelProfileDto extends PartialType(CreateUserTravelProfileDto) {}
