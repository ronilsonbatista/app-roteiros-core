import { BadRequestException, NotFoundException } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { LocalMediaStorageProvider } from './local-media-storage.provider';

describe('LocalMediaStorageProvider', () => {
  const folder = 'image-bank-spec';
  const folderPath = path.join(process.cwd(), 'uploads', folder);

  afterAll(() => {
    fs.rmSync(folderPath, { recursive: true, force: true });
  });

  it('devolve path público de dev e apaga pela chave, sem devolver o binário', async () => {
    process.env.MEDIA_BASE_URL = 'http://localhost:3000/uploads';
    delete process.env.IMAGE_BANK_PUBLIC_BASE_URL;
    const provider = new LocalMediaStorageProvider();
    const uploaded = await provider.uploadFile(
      {
        buffer: Buffer.from('png-bytes'),
        originalname: 'spot.png',
        mimetype: 'image/png',
        size: 9,
      } as Express.Multer.File,
      folder,
    );

    const read = await provider.resolveReadUrl(uploaded.key);
    expect(read).toEqual({
      url: `http://localhost:3000/uploads/${uploaded.key}`,
      expiresAt: null,
    });
    expect(read).not.toHaveProperty('stream');
    expect(
      fs.existsSync(path.join(process.cwd(), 'uploads', uploaded.key)),
    ).toBe(true);

    await provider.deleteByKey(uploaded.key);
    await expect(provider.getFile(uploaded.key)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('recusa chave que sai do diretório de upload', async () => {
    const provider = new LocalMediaStorageProvider();
    await expect(
      provider.deleteByKey('../package.json'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(fs.existsSync(path.join(process.cwd(), 'package.json'))).toBe(true);
  });
});
