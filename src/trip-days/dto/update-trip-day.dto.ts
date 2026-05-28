import { PartialType } from '@nestjs/swagger';
import { CreateTripDayDto } from './create-trip-day.dto';

export class UpdateTripDayDto extends PartialType(CreateTripDayDto) {}
