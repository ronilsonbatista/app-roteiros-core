import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsEnum, IsNotEmpty, IsOptional, Length } from 'class-validator';
import { OtpPurpose } from '@prisma/client';

export class VerifyOtpDto {
  @ApiProperty({
    example: 'usuario@email.com',
    description: 'E-mail do usuário',
  })
  @IsEmail({}, { message: 'Formato de e-mail inválido' })
  email: string;

  @ApiProperty({
    example: '123456',
    description: 'Código OTP de 6 dígitos recebido por e-mail',
  })
  @IsNotEmpty({ message: 'O código OTP é obrigatório' })
  @Length(6, 6, { message: 'O código OTP deve ter exatamente 6 dígitos' })
  code: string;

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
