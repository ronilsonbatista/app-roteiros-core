import { PartialType } from '@nestjs/swagger';
import { CreateBaseTripDayDto } from './create-base-trip-day.dto';

export class UpdateBaseTripDayDto extends PartialType(CreateBaseTripDayDto) {}
