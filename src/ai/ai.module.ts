import { Module } from '@nestjs/common';
import { AiService } from './ai.service';
import { AiController } from './ai.controller';
import { AdminAiRequestsController } from './admin-ai-requests/admin-ai-requests.controller';
import { OpenAIProvider } from './providers/openai.provider';
import { CurationRetrievalService } from './curation/curation-retrieval.service';

import { PlacesModule } from '../places/places.module';

@Module({
  imports: [PlacesModule],
  providers: [AiService, OpenAIProvider, CurationRetrievalService],
  controllers: [AiController, AdminAiRequestsController],
  exports: [AiService, OpenAIProvider, CurationRetrievalService],
})
export class AiModule {}
