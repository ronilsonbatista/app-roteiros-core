import { Module } from '@nestjs/common';
import { MediaModule } from '../media/media.module';
import { AdminImageBankController } from './admin-image-bank.controller';
import { ImageBankController } from './image-bank.controller';
import { ImageBankPrismaService } from './image-bank-prisma.service';
import { ImageBankService } from './image-bank.service';

@Module({
  imports: [MediaModule],
  controllers: [ImageBankController, AdminImageBankController],
  providers: [ImageBankPrismaService, ImageBankService],
})
export class ImageBankModule {}
