import { IsEmail, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class InviteParticipantDto {
  @ApiProperty()
  @IsEmail()
  @IsNotEmpty()
  email: string;
}
