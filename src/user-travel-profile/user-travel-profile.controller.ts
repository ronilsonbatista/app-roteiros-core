import { Controller, Post, Get, Patch, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { UserTravelProfileService } from './user-travel-profile.service';
import { CreateUserTravelProfileDto } from './dto/create-user-travel-profile.dto';
import { UpdateUserTravelProfileDto } from './dto/update-user-travel-profile.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('Travel Profile - App')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class UserTravelProfileController {
  constructor(private readonly userTravelProfileService: UserTravelProfileService) {}

  @ApiTags('Travel Profile - App')
  @Post('users/me/travel-profile')
  @ApiOperation({ summary: 'Criar perfil do viajante' })
  create(@CurrentUser() user: any, @Body() dto: CreateUserTravelProfileDto) {
    return this.userTravelProfileService.create(user.userId, dto);
  }

  @ApiTags('Travel Profile - App')
  @Get('users/me/travel-profile')
  @ApiOperation({ summary: 'Visualizar perfil do viajante' })
  findOne(@CurrentUser() user: any) {
    return this.userTravelProfileService.findOne(user.userId);
  }

  @ApiTags('Travel Profile - App')
  @Patch('users/me/travel-profile')
  @ApiOperation({ summary: 'Atualizar perfil do viajante' })
  update(@CurrentUser() user: any, @Body() dto: UpdateUserTravelProfileDto) {
    return this.userTravelProfileService.update(user.userId, dto);
  }

  @ApiTags('Travel Profile - App')
  @Delete('users/me/travel-profile')
  @ApiOperation({ summary: 'Remover perfil do viajante' })
  remove(@CurrentUser() user: any) {
    return this.userTravelProfileService.remove(user.userId);
  }

  @ApiTags('Admin - Users')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @Get('admin/users/:id/travel-profile')
  @ApiOperation({ summary: 'Visualizar perfil do viajante de um usuário específico (Admin)' })
  getAdminUserTravelProfile(@Param('id') id: string) {
    return this.userTravelProfileService.getAdminUserTravelProfile(id);
  }
}
