import { Controller, Get, Patch, Post, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { AdminService } from './admin.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('Admin')
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
}
