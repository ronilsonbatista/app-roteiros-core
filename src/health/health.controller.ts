import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';
import * as fs from 'fs';
import * as path from 'path';

@ApiTags('System')
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({ summary: 'Status de saúde do sistema' })
  async getHealth() {
    let dbStatus = 'OK';
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch (error) {
      dbStatus = 'DOWN';
    }

    const openaiKey = process.env.OPENAI_API_KEY;
    const googleKey = process.env.GOOGLE_MAPS_API_KEY;

    return {
      api: 'OK',
      database: dbStatus,
      openaiConfigured: openaiKey && openaiKey.length > 5 ? 'OK' : 'Not Configured',
      googleMapsConfigured: googleKey && googleKey.length > 5 ? 'OK' : 'Not Configured',
      uploadFolderStatus: fs.existsSync(path.join(process.cwd(), 'uploads')) ? 'OK' : 'Not Created',
      timestamp: new Date().toISOString(),
    };
  }
}
