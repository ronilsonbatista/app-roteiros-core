import { DynamicModule, Module } from '@nestjs/common';
import { MediaModule } from '../media/media.module';
import { AdminImageBankController } from './admin-image-bank.controller';
import { ImageBankController } from './image-bank.controller';
import { ImageBankPrismaService } from './image-bank-prisma.service';
import { ImageBankService } from './image-bank.service';

@Module({})
export class ImageBankModule {
  /**
   * Image bank needs a dedicated Postgres URL. Staging may omit it until
   * ops provisions the DB — skip controllers/providers so core still boots.
   */
  static register(): DynamicModule {
    const configured = Boolean(process.env.IMAGE_BANK_DATABASE_URL?.trim());
    if (!configured) {
      return {
        module: ImageBankModule,
      };
    }
    return {
      module: ImageBankModule,
      imports: [MediaModule],
      controllers: [ImageBankController, AdminImageBankController],
      providers: [ImageBankPrismaService, ImageBankService],
    };
  }
}
