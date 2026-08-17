import { Module } from '@nestjs/common';
import { MediaService } from './media.service';
import { MediaController } from './media.controller';
import { LocalMediaStorageProvider } from './providers/local-media-storage.provider';

@Module({
  providers: [MediaService, LocalMediaStorageProvider],
  controllers: [MediaController],
})
export class MediaModule {}
