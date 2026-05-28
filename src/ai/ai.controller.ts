import { Controller, Post, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { AiService } from './ai.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Throttle } from '@nestjs/throttler';

@ApiTags('AI - Trip Generation')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('trips')
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Throttle({ default: { limit: 3, ttl: 60000 } })
  @Post(':tripId/generate-itinerary')
  @ApiOperation({ summary: 'Gerar um roteiro real via OpenAI (GPT)' })
  generateItinerary(
    @CurrentUser() user: any,
    @Param('tripId') tripId: string,
    @Body() body: any,
  ) {
    return this.aiService.generateItinerary(user.userId, tripId, body);
  }
}
