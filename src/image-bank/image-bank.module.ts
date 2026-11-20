import { Module } from '@nestjs/common';
import { MediaModule } from '../media/media.module';
import { ImageBankService } from './image-bank.service';
import { ImageBankController } from './image-bank.controller';
import { AdminImageBankController } from './admin-image-bank.controller';

@Module({
  imports: [MediaModule],
  controllers: [ImageBankController, AdminImageBankController],
  providers: [ImageBankService],
  exports: [ImageBankService],
})
export class ImageBankModule {}
