import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('Users - App')
@ApiBearerAuth()
@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController {

  @Get('me')
  @ApiOperation({ summary: 'Obter perfil do usuário autenticado' })
  @ApiResponse({ status: 200, description: 'Perfil retornado com sucesso.' })
  @ApiResponse({ status: 401, description: 'Não autorizado.' })
  getProfile(@CurrentUser() user: any) {
    return {
      message: 'Acesso liberado!',
      user,
    };
  }

  @Get('admin')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Rota exclusiva para administradores' })
  @ApiResponse({ status: 200, description: 'Acesso de administrador liberado.' })
  @ApiResponse({ status: 403, description: 'Acesso negado (requer role ADMIN).' })
  getAdminData(@CurrentUser() user: any) {
    return {
      message: 'Bem-vindo à área administrativa!',
      adminUser: user,
    };
  }
}
