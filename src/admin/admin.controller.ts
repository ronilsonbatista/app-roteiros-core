import { Controller, Get, Patch, Post, Param, Query, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { AdminService } from './admin.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CreateUserAdminDto } from './dto/create-user-admin.dto';
import { UpdateUserAdminDto } from './dto/update-user-admin.dto';
import { ChangePasswordAdminDto } from './dto/change-password-admin.dto';
import { UpdateUserTravelProfileDto } from '../user-travel-profile/dto/update-user-travel-profile.dto';

@ApiTags('Admin - Users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('users')
  @ApiOperation({ summary: 'Listar usuários com paginação e filtro' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false, type: String })
  getUsers(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
  ) {
    const pageNumber = page ? parseInt(page, 10) : 1;
    const limitNumber = limit ? parseInt(limit, 10) : 10;
    return this.adminService.getUsers(pageNumber, limitNumber, search);
  }

  @Get('users/:id')
  @ApiOperation({ summary: 'Detalhar informações de um usuário' })
  getUser(@Param('id') id: string) {
    return this.adminService.getUser(id);
  }

  @Patch('users/:id/block')
  @ApiOperation({ summary: 'Bloquear um usuário' })
  blockUser(@CurrentUser() admin: any, @Param('id') id: string) {
    return this.adminService.blockUser(admin.userId, id);
  }

  @Patch('users/:id/unblock')
  @ApiOperation({ summary: 'Desbloquear um usuário' })
  unblockUser(@Param('id') id: string) {
    return this.adminService.unblockUser(id);
  }

  @Post('users/:id/logout-all')
  @ApiOperation({ summary: 'Revogar todos os tokens ativos de um usuário' })
  logoutAll(@Param('id') id: string) {
    return this.adminService.logoutAll(id);
  }

  @Get('users/:id/trips')
  @ApiOperation({ summary: 'Listar todas as viagens de um usuário' })
  getUserTrips(@Param('id') id: string) {
    return this.adminService.getUserTrips(id);
  }

  @Post('users')
  @ApiOperation({ summary: 'Criar um novo usuário (USER ou ADMIN)' })
  createUser(@Body() dto: CreateUserAdminDto) {
    return this.adminService.createUser(dto);
  }

  @Patch('users/:id')
  @ApiOperation({ summary: 'Atualizar dados de um usuário' })
  updateUser(@Param('id') id: string, @Body() dto: UpdateUserAdminDto) {
    return this.adminService.updateUser(id, dto);
  }

  @Patch('users/:id/change-password')
  @ApiOperation({ summary: 'Alterar senha de um usuário' })
  changePassword(@Param('id') id: string, @Body() dto: ChangePasswordAdminDto) {
    return this.adminService.changeUserPassword(id, dto);
  }

  @Patch('users/:id/travel-profile')
  @ApiOperation({ summary: 'Atualizar perfil de viagem de um usuário (Admin)' })
  updateTravelProfile(
    @Param('id') id: string,
    @Body() dto: UpdateUserTravelProfileDto,
  ) {
    return this.adminService.updateUserTravelProfile(id, dto);
  }

  @Patch('users/:id/archive')
  @ApiOperation({ summary: 'Arquivar a conta de um usuário (Admin)' })
  archiveUser(
    @CurrentUser() admin: any,
    @Param('id') id: string,
  ) {
    return this.adminService.archiveUser(admin.userId, id);
  }

  @Patch('users/:id/restore')
  @ApiOperation({ summary: 'Restaurar a conta de um usuário arquivado (Admin)' })
  restoreUser(
    @Param('id') id: string,
  ) {
    return this.adminService.restoreUser(id);
  }
}
