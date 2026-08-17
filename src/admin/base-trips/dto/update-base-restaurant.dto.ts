import { PartialType } from '@nestjs/swagger';
import { CreateBaseRestaurantDto } from './create-base-restaurant.dto';

export class UpdateBaseRestaurantDto extends PartialType(
  CreateBaseRestaurantDto,
) {}
