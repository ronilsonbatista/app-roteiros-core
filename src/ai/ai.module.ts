import { Module } from '@nestjs/common';
import { AiService } from './ai.service';
import { AiController } from './ai.controller';
import { AdminAiRequestsController } from './admin-ai-requests/admin-ai-requests.controller';
import { OpenAIProvider } from './providers/openai.provider';

@Module({
  providers: [AiService, OpenAIProvider],
  controllers: [AiController, AdminAiRequestsController]
})
export class AiModule {}
