import { PartialType } from '@nestjs/swagger';
import { CreateBaseTripDto } from './create-base-trip.dto';

export class UpdateBaseTripDto extends PartialType(CreateBaseTripDto) {}
