import {
  ConflictException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  ImageBankImageVariant,
  ImageBankStatus,
} from '@prisma/image-bank-client';
import { ImageBankPrismaService } from './image-bank-prisma.service';
import { ImageBankService } from './image-bank.service';

function isCreatePayload(
  value: unknown,
): value is [{ data: Record<string, unknown> }] {
  if (!Array.isArray(value) || value.length === 0) return false;
  const payload: unknown = value[0];
  return (
    typeof payload === 'object' &&
    payload !== null &&
    'data' in payload &&
    typeof payload.data === 'object' &&
    payload.data !== null
  );
}

function jpeg(width: number, height: number): Buffer {
  return Buffer.from([
    0xff,
    0xd8,
    0xff,
    0xc0,
    0x00,
    0x0b,
    0x08,
    (height >> 8) & 0xff,
    height & 0xff,
    (width >> 8) & 0xff,
    width & 0xff,
    0x01,
    0x01,
    0x11,
    0x00,
    0xff,
    0xd9,
  ]);
}

describe('ImageBankService', () => {
  const storageKey = 'image-bank/city-1/photo.jpg';
  let prisma: {
    imageBankDestination: {
      findMany: jest.Mock;
      count: jest.Mock;
      findFirst: jest.Mock;
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
    imageBankCity: {
      findFirst: jest.Mock;
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
      count: jest.Mock;
      aggregate: jest.Mock;
    };
    imageBankSpotImage: {
      findFirst: jest.Mock;
      findUnique: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      deleteMany: jest.Mock;
    };
    $transaction: jest.Mock;
  };
  let storage: {
    uploadFile: jest.Mock;
    deleteByKey: jest.Mock;
    resolveReadUrl: jest.Mock;
    deleteFile: jest.Mock;
    getFile: jest.Mock;
  };
  let service: ImageBankService;

  beforeEach(() => {
    prisma = {
      imageBankDestination: {
        findMany: jest.fn(),
        count: jest.fn(),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      imageBankCity: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        count: jest.fn(),
        aggregate: jest.fn(),
      },
      imageBankSpotImage: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        deleteMany: jest.fn(),
      },
      $transaction: jest.fn(async (arg: unknown) => {
        if (typeof arg === 'function') {
          return (arg as (tx: typeof prisma) => Promise<unknown>)(prisma);
        }
        return Promise.all(arg as Promise<unknown>[]);
      }),
    };
    storage = {
      uploadFile: jest.fn().mockResolvedValue({
        url: 'http://localhost:3000/uploads/image-bank/city-1/photo.jpg',
        filename: 'photo.jpg',
        key: storageKey,
        mimeType: 'image/jpeg',
        size: 17,
      }),
      deleteByKey: jest.fn().mockResolvedValue(undefined),
      resolveReadUrl: jest.fn().mockResolvedValue({
        url: 'http://localhost:3000/uploads/image-bank/city-1/photo.jpg',
        expiresAt: null,
      }),
      deleteFile: jest.fn(),
      getFile: jest.fn(),
    };
    service = new ImageBankService(
      prisma as unknown as ImageBankPrismaService,
      storage,
    );
  });

  it('cria cidade rascunho sem exigir 5 imagens', async () => {
    prisma.imageBankDestination.findUnique.mockResolvedValue({ id: 'dest-1' });
    prisma.imageBankCity.findFirst.mockResolvedValue(null);
    prisma.imageBankCity.aggregate.mockResolvedValue({
      _max: { sortOrder: null },
    });
    prisma.imageBankCity.create.mockResolvedValue({
      id: 'city-1',
      destinationId: 'dest-1',
      slug: 'paris',
      name: 'Paris',
      summary: null,
      sortOrder: 0,
      status: ImageBankStatus.DRAFT,
    });

    const created = await service.createCity('dest-1', {
      name: 'Paris',
      slug: 'paris',
    });

    expect(created.status).toBe(ImageBankStatus.DRAFT);
    expect(created.originalImageCount).toBe(0);
  });

  it('grava a chave no banco e devolve URL, nunca o binário', async () => {
    const fileBytes = jpeg(3, 2);
    prisma.imageBankCity.findUnique.mockResolvedValue({ id: 'city-1' });
    prisma.imageBankSpotImage.findFirst.mockResolvedValue(null);
    prisma.imageBankSpotImage.count.mockResolvedValue(0);
    prisma.imageBankSpotImage.create.mockImplementation(
      ({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({
          id: 'img-1',
          cityId: 'city-1',
          derivedFromId: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...data,
        }),
    );

    const result = await service.uploadImage(
      'city-1',
      {
        buffer: fileBytes,
        originalname: 'cristo.jpg',
        mimetype: 'image/jpeg',
        size: fileBytes.length,
      } as Express.Multer.File,
      {
        spotName: 'Cristo Redentor',
        altText: 'Cristo no Corcovado',
        sortOrder: 1,
      },
    );

    expect(storage.uploadFile).toHaveBeenCalledWith(
      expect.objectContaining({ mimetype: 'image/jpeg' }),
      'image-bank/city-1',
    );
    const firstCall: unknown = prisma.imageBankSpotImage.create.mock.calls[0];
    if (!isCreatePayload(firstCall)) {
      throw new Error('upload should persist a row');
    }
    const persisted = firstCall[0];
    expect(persisted.data).toEqual(
      expect.objectContaining({
        storageKey,
        mimeType: 'image/jpeg',
        width: 3,
        height: 2,
        bytes: fileBytes.length,
        altText: 'Cristo no Corcovado',
        sortOrder: 1,
        variant: ImageBankImageVariant.ORIGINAL,
      }),
    );
    expect(persisted.data).not.toHaveProperty('buffer');
    expect(JSON.stringify(persisted.data)).not.toContain(
      fileBytes.toString('base64'),
    );
    expect(result.url).toBe(
      'http://localhost:3000/uploads/image-bank/city-1/photo.jpg',
    );
    expect(result.urlExpiresAt).toBeNull();
    expect(result).not.toHaveProperty('buffer');
    expect(result.storageKey).toBe(storageKey);
  });

  it('recusa a sexta imagem original e apaga o arquivo recém-enviado', async () => {
    const fileBytes = jpeg(3, 2);
    prisma.imageBankCity.findUnique.mockResolvedValue({ id: 'city-1' });
    prisma.imageBankSpotImage.findFirst.mockResolvedValue(null);
    prisma.imageBankSpotImage.count.mockResolvedValue(5);

    await expect(
      service.uploadImage(
        'city-1',
        {
          buffer: fileBytes,
          originalname: 'extra.jpg',
          mimetype: 'image/jpeg',
          size: fileBytes.length,
        } as Express.Multer.File,
        { spotName: 'Extra', altText: 'Foto extra', sortOrder: 1 },
      ),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);

    expect(prisma.imageBankSpotImage.create).not.toHaveBeenCalled();
    expect(storage.deleteByKey).toHaveBeenCalledWith(storageKey);
  });

  it('impede publicar cidade com menos de 5 imagens', async () => {
    prisma.imageBankCity.findUnique.mockResolvedValue({
      id: 'city-1',
      destinationId: 'dest-1',
      slug: 'paris',
      name: 'Paris',
      summary: null,
      sortOrder: 0,
      status: ImageBankStatus.DRAFT,
      destination: { id: 'dest-1', status: ImageBankStatus.DRAFT },
    });
    prisma.imageBankSpotImage.count.mockResolvedValue(2);

    await expect(
      service.updateCity('city-1', { status: ImageBankStatus.PUBLISHED }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(prisma.imageBankCity.update).not.toHaveBeenCalled();
  });

  it('publica cidade que já tem 5 imagens', async () => {
    prisma.imageBankCity.findUnique.mockResolvedValue({
      id: 'city-1',
      destinationId: 'dest-1',
      slug: 'rio',
      name: 'Rio',
      summary: null,
      sortOrder: 0,
      status: ImageBankStatus.DRAFT,
      destination: { id: 'dest-1', status: ImageBankStatus.DRAFT },
    });
    prisma.imageBankSpotImage.count.mockResolvedValue(5);
    prisma.imageBankCity.update.mockResolvedValue({
      id: 'city-1',
      destinationId: 'dest-1',
      slug: 'rio',
      name: 'Rio',
      summary: null,
      sortOrder: 0,
      status: ImageBankStatus.PUBLISHED,
    });

    const updated = await service.updateCity('city-1', {
      status: ImageBankStatus.PUBLISHED,
    });

    expect(updated.status).toBe(ImageBankStatus.PUBLISHED);
    expect(updated.originalImageCount).toBe(5);
  });

  it('não remove imagem de cidade publicada', async () => {
    prisma.imageBankSpotImage.findUnique.mockResolvedValue({
      id: 'img-1',
      variant: ImageBankImageVariant.ORIGINAL,
      city: { status: ImageBankStatus.PUBLISHED },
    });

    await expect(service.deleteImage('img-1')).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(prisma.imageBankSpotImage.deleteMany).not.toHaveBeenCalled();
  });

  it('lista pública devolve só o card', async () => {
    prisma.imageBankDestination.findMany.mockResolvedValue([
      {
        name: 'Rio de Janeiro',
        slug: 'rio-de-janeiro',
        cities: [
          {
            name: 'Rio de Janeiro',
            slug: 'rio-de-janeiro',
            images: [{ storageKey }],
          },
        ],
      },
    ]);
    prisma.imageBankDestination.count.mockResolvedValue(1);

    const page = await service.listPublicDestinations({});
    const card = page.items[0];

    expect(storage.resolveReadUrl).toHaveBeenCalledTimes(1);
    expect(storage.resolveReadUrl).toHaveBeenCalledWith(storageKey);
    expect(card).toEqual({
      name: 'Rio de Janeiro',
      slug: 'rio-de-janeiro',
      city: { name: 'Rio de Janeiro', slug: 'rio-de-janeiro' },
      coverUrl: 'http://localhost:3000/uploads/image-bank/city-1/photo.jpg',
    });
    expect(JSON.stringify(card)).not.toMatch(
      /width|height|bytes|altText|storageKey/,
    );
  });

  it('detalhe da cidade devolve só url, alt e ordem', async () => {
    prisma.imageBankCity.findFirst.mockResolvedValue({
      name: 'Rio de Janeiro',
      slug: 'rio-de-janeiro',
      destination: { name: 'Rio de Janeiro', slug: 'rio-de-janeiro' },
      images: [
        {
          altText: 'Cristo no Corcovado',
          sortOrder: 1,
          storageKey,
        },
      ],
    });

    const detail = await service.getPublicCity(
      'rio-de-janeiro',
      'rio-de-janeiro',
    );

    expect(detail.images).toEqual([
      {
        url: 'http://localhost:3000/uploads/image-bank/city-1/photo.jpg',
        alt: 'Cristo no Corcovado',
        order: 1,
      },
    ]);
    expect(Object.keys(detail.images[0]).sort()).toEqual([
      'alt',
      'order',
      'url',
    ]);
    expect(JSON.stringify(detail)).not.toMatch(/width|height|bytes|storageKey/);
  });
});
