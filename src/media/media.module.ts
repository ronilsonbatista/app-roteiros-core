import { Module } from '@nestjs/common';
import { MediaService } from './media.service';
import { MediaController } from './media.controller';
import { LocalMediaStorageProvider } from './providers/local-media-storage.provider';
import { S3MediaStorageProvider } from './providers/s3-media-storage.provider';
import { MediaStorageProvider } from './providers/media-storage.interface';

@Module({
  controllers: [MediaController],
  providers: [
    MediaService,
    LocalMediaStorageProvider,
    S3MediaStorageProvider,
    {
      provide: MediaStorageProvider,
      useFactory: (
        localProvider: LocalMediaStorageProvider,
        s3Provider: S3MediaStorageProvider,
      ) => {
        const providerType = process.env.MEDIA_STORAGE_PROVIDER;
        if (providerType === 's3') {
          return s3Provider;
        }
        return localProvider;
      },
      inject: [LocalMediaStorageProvider, S3MediaStorageProvider],
    },
  ],
  exports: [MediaService, MediaStorageProvider],
})
export class MediaModule {}
