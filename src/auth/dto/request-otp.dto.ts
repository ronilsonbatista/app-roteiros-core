import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsEnum, IsOptional } from 'class-validator';
import { OtpPurpose } from '@prisma/client';

export class RequestOtpDto {
  @ApiProperty({
    example: 'usuario@email.com',
    description: 'E-mail do usuário para recebimento do código de 6 dígitos',
  })
  @IsEmail({}, { message: 'Formato de e-mail inválido' })
  email: string;

  @ApiProperty({
    example: 'LOGIN',
    enum: OtpPurpose,
    required: false,
    description: 'Propósito do código OTP (SIGNUP, LOGIN, EMAIL_VERIFICATION, PASSWORD_RESET)',
  })
  @IsOptional()
  @IsEnum(OtpPurpose, { message: 'Propósito de OTP inválido' })
  purpose?: OtpPurpose;
}
