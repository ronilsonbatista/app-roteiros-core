import { IsEmail, IsString, IsEnum, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Role } from '@prisma/client';

export class UpdateUserAdminDto {
  @ApiProperty({ example: 'joao@email.com', required: false })
  @IsEmail()
  @IsOptional()
  email?: string;

  @ApiProperty({ example: 'João Silva', required: false })
  @IsString()
  @IsOptional()
  fullName?: string;

  @ApiProperty({ enum: Role, required: false })
  @IsEnum(Role)
  @IsOptional()
  role?: Role;
}
