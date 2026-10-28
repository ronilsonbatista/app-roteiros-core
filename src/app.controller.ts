import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AppService } from './app.service';

@ApiTags('System')
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('version')
  getVersion() {
    return {
      name: 'app-roteiros-core',
      version: '1.0.0',
      commit: process.env.RAILWAY_GIT_COMMIT_SHA || process.env.GIT_COMMIT_SHA || 'unknown',
      environment: process.env.NODE_ENV || 'production',
      jwt: {
        accessExpiresIn: process.env.JWT_EXPIRES_IN || '8h',
        refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d',
      },
      timestamp: new Date().toISOString(),
    };
  }
}
