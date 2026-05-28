import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RefreshTokenDto {
  @ApiProperty({ example: 'seu-refresh-token-aqui' })
  @IsString()
  @IsNotEmpty()
  refreshToken: string;
}
