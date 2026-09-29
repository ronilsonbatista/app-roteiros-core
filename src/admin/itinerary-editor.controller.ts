import { Controller, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ItineraryEditorService } from './itinerary-editor.service';

@ApiTags('Admin - Itinerary Editor')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller('admin/editor')
export class ItineraryEditorController {
  constructor(private editor: ItineraryEditorService) {}

  @Throttle({ default: { limit: 3, ttl: 60000 } })
  @Post('trips/:id/generate')
  generateTrip(@Param('id') id: string) {
    return this.editor.generateTrip(id);
  }

  @Throttle({ default: { limit: 3, ttl: 60000 } })
  @Post('base-trips/:id/generate')
  generateBaseTrip(@Param('id') id: string) {
    return this.editor.generateBaseTrip(id);
  }

  @Post('trips/:id/copy-to-base')
  copyTrip(@Param('id') id: string, @CurrentUser() admin: { userId: string }) {
    return this.editor.copyTripToBase(id, admin.userId);
  }
}
