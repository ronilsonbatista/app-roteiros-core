import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, Length, MinLength } from 'class-validator';

export class ResetPasswordDto {
  @ApiProperty({
    example: 'usuario@email.com',
    description: 'E-mail cadastrado do usuário',
  })
  @IsEmail({}, { message: 'Formato de e-mail inválido' })
  email: string;

  @ApiProperty({
    example: '123456',
    description: 'Código OTP de 6 dígitos recebido para redefinição de senha',
  })
  @IsNotEmpty({ message: 'O código OTP é obrigatório' })
  @Length(6, 6, { message: 'O código OTP deve ter exatamente 6 dígitos' })
  code: string;

  @ApiProperty({
    example: 'NovaSenhaSegura123!',
    description: 'Nova senha do usuário (mínimo de 6 caracteres)',
  })
  @IsNotEmpty({ message: 'A nova senha é obrigatória' })
  @MinLength(6, { message: 'A senha deve ter no mínimo 6 caracteres' })
  newPassword: string;
}
