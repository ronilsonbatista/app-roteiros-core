import { MODULE_METADATA } from '@nestjs/common/constants';
import { ImageBankModule } from './image-bank.module';
import { ImageBankPrismaService } from './image-bank-prisma.service';

describe('ImageBankModule', () => {
  const original = process.env.IMAGE_BANK_DATABASE_URL;

  afterEach(() => {
    if (original === undefined) {
      delete process.env.IMAGE_BANK_DATABASE_URL;
    } else {
      process.env.IMAGE_BANK_DATABASE_URL = original;
    }
  });

  it('não exporta a conexão do banco de imagens para o resto do core quando configurado', () => {
    process.env.IMAGE_BANK_DATABASE_URL =
      'postgresql://unused:unused@127.0.0.1:5432/image_bank';
    const dynamic = ImageBankModule.register();

    expect(dynamic.exports ?? []).toEqual([]);
    expect(dynamic.providers).toContain(ImageBankPrismaService);
  });

  it('fica inerte sem IMAGE_BANK_DATABASE_URL (staging sem DB dedicado)', () => {
    delete process.env.IMAGE_BANK_DATABASE_URL;
    const dynamic = ImageBankModule.register();

    expect(dynamic.providers ?? []).toEqual([]);
    expect(dynamic.controllers ?? []).toEqual([]);
  });

  it('decorator estático não registra providers no metadata do class module', () => {
    const providers = Reflect.getMetadata(
      MODULE_METADATA.PROVIDERS,
      ImageBankModule,
    ) as unknown[] | undefined;
    expect(providers ?? []).toEqual([]);
  });
});
