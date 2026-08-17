import { ApiProperty } from '@nestjs/swagger';
import { IsEmail } from 'class-validator';

export class ForgotPasswordDto {
  @ApiProperty({
    example: 'usuario@email.com',
    description: 'E-mail cadastrado do usuário para recuperação de senha',
  })
  @IsEmail({}, { message: 'Formato de e-mail inválido' })
  email: string;
}
