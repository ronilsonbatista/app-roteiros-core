import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
} from '@nestjs/swagger';
import { AiService } from '../ai.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';

@ApiTags('Admin - AI')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller('admin/ai-requests')
export class AdminAiRequestsController {
  constructor(private readonly aiService: AiService) {}

  @Get()
  @ApiOperation({ summary: 'Listar todos os logs de requisições de IA' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'status', required: false, type: String })
  @ApiQuery({ name: 'userId', required: false, type: String })
  @ApiQuery({ name: 'tripId', required: false, type: String })
  @ApiQuery({ name: 'baseTripId', required: false, type: String })
  @ApiQuery({ name: 'provider', required: false, type: String })
  @ApiQuery({ name: 'model', required: false, type: String })
  findAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: string,
    @Query('userId') userId?: string,
    @Query('tripId') tripId?: string,
    @Query('baseTripId') baseTripId?: string,
    @Query('provider') provider?: string,
    @Query('model') model?: string,
  ) {
    const pageNumber = page ? parseInt(page, 10) : 1;
    const limitNumber = limit ? parseInt(limit, 10) : 10;
    return this.aiService.getAdminAiRequests(pageNumber, limitNumber, {
      status,
      userId,
      tripId,
      baseTripId,
      provider,
      model,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalhar um log de requisição de IA' })
  findOne(@Param('id') id: string) {
    return this.aiService.getAdminAiRequestDetails(id);
  }
}
