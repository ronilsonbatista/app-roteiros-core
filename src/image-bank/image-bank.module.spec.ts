import { MODULE_METADATA } from '@nestjs/common/constants';
import { ImageBankModule } from './image-bank.module';
import { ImageBankPrismaService } from './image-bank-prisma.service';

describe('ImageBankModule', () => {
  it('não exporta a conexão do banco de imagens para o resto do core', () => {
    const exported = Reflect.getMetadata(
      MODULE_METADATA.EXPORTS,
      ImageBankModule,
    ) as unknown[] | undefined;

    expect(exported ?? []).toEqual([]);

    const providers = Reflect.getMetadata(
      MODULE_METADATA.PROVIDERS,
      ImageBankModule,
    ) as unknown[];
    expect(providers).toContain(ImageBankPrismaService);
  });
});
