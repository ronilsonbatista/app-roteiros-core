import { PartialType } from '@nestjs/swagger';
import { CreateBaseAttractionDto } from './create-base-attraction.dto';

export class UpdateBaseAttractionDto extends PartialType(
  CreateBaseAttractionDto,
) {}
