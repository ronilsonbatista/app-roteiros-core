import { Controller, Get, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UsersService } from './users.service';

@ApiTags('Users - App')
@ApiBearerAuth()
@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  @ApiOperation({ summary: 'Obter perfil do usuário autenticado' })
  @ApiResponse({
    status: 200,
    description:
      'Perfil retornado com sucesso. `user` inclui id, displayName (nome completo) e photoUrl (null quando sem foto), além dos campos anteriores (userId, email, role).',
  })
  @ApiResponse({ status: 401, description: 'Não autorizado.' })
  async getProfile(@CurrentUser() user: any) {
    const dbUser = await this.usersService.findById(user.userId);

    return {
      message: 'Acesso liberado!',
      user: {
        ...user,
        id: user.userId,
        displayName: dbUser?.fullName ?? null,
        photoUrl: dbUser?.photoUrl ?? null,
      },
    };
  }

  @Get('admin')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Rota exclusiva para administradores' })
  @ApiResponse({
    status: 200,
    description: 'Acesso de administrador liberado.',
  })
  @ApiResponse({
    status: 403,
    description: 'Acesso negado (requer role ADMIN).',
  })
  getAdminData(@CurrentUser() user: any) {
    return {
      message: 'Bem-vindo à área administrativa!',
      adminUser: user,
    };
  }
}
