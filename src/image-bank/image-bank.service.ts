import {
  BadRequestException,
  ConflictException,
  HttpException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  ImageBankImageVariant,
  ImageBankSpotImage,
  ImageBankStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MediaStorageProvider } from '../media/providers/media-storage.interface';
import { inspectImage, ImageMimeType } from './image-dimensions';
import {
  imageBankMaxBytes,
  PUBLISHED_CITY_IMAGE_COUNT,
} from './image-bank.constants';
import { slugify } from './slugify';
import {
  AdminDestinationDetail,
  AdminDestinationListItem,
  AdminSpotImage,
  CitySummary,
  DeletedImageBankRecord,
  Page,
  PublicCityDetail,
  PublicDestinationDetail,
  PublicDestinationListItem,
  PublicSpotImage,
  toAdminImage,
  toPublicImage,
} from './image-bank.presenter';
import {
  AdminListQueryDto,
  CreateCityDto,
  CreateDestinationDto,
  PublicListQueryDto,
  UpdateCityDto,
  UpdateDestinationDto,
  UpdateSpotImageDto,
  UploadSpotImageDto,
} from './dto/image-bank.dto';

interface SavedOriginal {
  image: ImageBankSpotImage;
  replacedKeys: string[];
}

@Injectable()
export class ImageBankService {
  private readonly logger = new Logger(ImageBankService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: MediaStorageProvider,
  ) {}

  async listPublicDestinations(
    query: PublicListQueryDto,
  ): Promise<Page<PublicDestinationListItem>> {
    const page = this.page(query);
    const where = { status: ImageBankStatus.PUBLISHED };
    const [rows, total] = await Promise.all([
      this.prisma.imageBankDestination.findMany({
        where,
        orderBy: [{ name: 'asc' }, { slug: 'asc' }],
        skip: page.offset,
        take: page.limit,
        include: {
          cities: {
            where: { status: ImageBankStatus.PUBLISHED },
            select: { id: true },
          },
        },
      }),
      this.prisma.imageBankDestination.count({ where }),
    ]);

    return {
      ...page,
      total,
      items: rows.map((row) => ({
        id: row.id,
        slug: row.slug,
        name: row.name,
        country: row.country,
        region: row.region,
        summary: row.summary,
        baseTripId: row.baseTripId,
        publishedCityCount: row.cities.length,
      })),
    };
  }

  async getPublicDestination(slug: string): Promise<PublicDestinationDetail> {
    const destination = await this.prisma.imageBankDestination.findFirst({
      where: { slug, status: ImageBankStatus.PUBLISHED },
      include: {
        cities: {
          where: { status: ImageBankStatus.PUBLISHED },
          orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
          include: {
            images: {
              where: { variant: ImageBankImageVariant.ORIGINAL },
              orderBy: { sortOrder: 'asc' },
            },
          },
        },
      },
    });
    if (!destination) throw new NotFoundException('Destino não encontrado');

    const cities = await Promise.all(
      destination.cities.map(async (city) => ({
        id: city.id,
        slug: city.slug,
        name: city.name,
        summary: city.summary,
        sortOrder: city.sortOrder,
        images: await this.presentPublicImages(city.images),
      })),
    );

    return {
      id: destination.id,
      slug: destination.slug,
      name: destination.name,
      country: destination.country,
      region: destination.region,
      summary: destination.summary,
      baseTripId: destination.baseTripId,
      cities,
    };
  }

  async getPublicCity(
    destinationSlug: string,
    citySlug: string,
  ): Promise<PublicCityDetail> {
    const city = await this.prisma.imageBankCity.findFirst({
      where: {
        slug: citySlug,
        status: ImageBankStatus.PUBLISHED,
        destination: {
          slug: destinationSlug,
          status: ImageBankStatus.PUBLISHED,
        },
      },
      include: {
        destination: { select: { slug: true, name: true, country: true } },
        images: {
          where: { variant: ImageBankImageVariant.ORIGINAL },
          orderBy: { sortOrder: 'asc' },
        },
      },
    });
    if (!city) throw new NotFoundException('Cidade não encontrada');

    return {
      id: city.id,
      slug: city.slug,
      name: city.name,
      summary: city.summary,
      sortOrder: city.sortOrder,
      destination: city.destination,
      images: await this.presentPublicImages(city.images),
    };
  }

  async listAdminDestinations(
    query: AdminListQueryDto,
  ): Promise<Page<AdminDestinationListItem>> {
    const page = this.page(query);
    const where = query.status ? { status: query.status } : {};
    const [rows, total] = await Promise.all([
      this.prisma.imageBankDestination.findMany({
        where,
        orderBy: [{ name: 'asc' }, { slug: 'asc' }],
        skip: page.offset,
        take: page.limit,
        include: {
          cities: {
            select: {
              status: true,
              images: {
                where: { variant: ImageBankImageVariant.ORIGINAL },
                select: { id: true },
              },
            },
          },
        },
      }),
      this.prisma.imageBankDestination.count({ where }),
    ]);

    return {
      ...page,
      total,
      items: rows.map((row) => ({
        id: row.id,
        slug: row.slug,
        name: row.name,
        country: row.country,
        region: row.region,
        summary: row.summary,
        status: row.status,
        baseTripId: row.baseTripId,
        publishedCityCount: row.cities.filter(
          (city) => city.status === ImageBankStatus.PUBLISHED,
        ).length,
        draftCityCount: row.cities.filter(
          (city) => city.status === ImageBankStatus.DRAFT,
        ).length,
        originalImageCount: row.cities.reduce(
          (sum, city) => sum + city.images.length,
          0,
        ),
      })),
    };
  }

  async getAdminDestination(id: string): Promise<AdminDestinationDetail> {
    const destination = await this.prisma.imageBankDestination.findUnique({
      where: { id },
      include: {
        cities: {
          orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
          include: {
            images: { orderBy: [{ variant: 'asc' }, { sortOrder: 'asc' }] },
          },
        },
      },
    });
    if (!destination) throw new NotFoundException('Destino não encontrado');

    const cities = await Promise.all(
      destination.cities.map(async (city) => ({
        id: city.id,
        destinationId: city.destinationId,
        slug: city.slug,
        name: city.name,
        summary: city.summary,
        sortOrder: city.sortOrder,
        status: city.status,
        originalImageCount: city.images.filter(
          (image) => image.variant === ImageBankImageVariant.ORIGINAL,
        ).length,
        images: await this.presentAdminImages(city.images),
      })),
    );

    return {
      id: destination.id,
      slug: destination.slug,
      name: destination.name,
      country: destination.country,
      region: destination.region,
      summary: destination.summary,
      status: destination.status,
      baseTripId: destination.baseTripId,
      cities,
    };
  }

  async createDestination(
    dto: CreateDestinationDto,
  ): Promise<AdminDestinationDetail> {
    if (dto.baseTripId) await this.assertBaseTrip(dto.baseTripId);
    const slug = await this.allocateDestinationSlug(dto.slug, dto.name);
    try {
      const created = await this.prisma.imageBankDestination.create({
        data: {
          name: dto.name,
          country: dto.country,
          slug,
          region: dto.region ?? null,
          summary: dto.summary ?? null,
          status: ImageBankStatus.DRAFT,
          baseTripId: dto.baseTripId ?? null,
        },
      });
      return {
        id: created.id,
        slug: created.slug,
        name: created.name,
        country: created.country,
        region: created.region,
        summary: created.summary,
        status: created.status,
        baseTripId: created.baseTripId,
        cities: [],
      };
    } catch (error) {
      this.rethrowPrisma(error);
    }
  }

  async updateDestination(
    id: string,
    dto: UpdateDestinationDto,
  ): Promise<AdminDestinationDetail> {
    const current = await this.prisma.imageBankDestination.findUnique({
      where: { id },
      select: { id: true, slug: true, baseTripId: true },
    });
    if (!current) throw new NotFoundException('Destino não encontrado');
    if (dto.slug && dto.slug !== current.slug) {
      await this.assertDestinationSlugAvailable(dto.slug);
    }
    if (dto.baseTripId) await this.assertBaseTrip(dto.baseTripId);
    if (dto.status === ImageBankStatus.PUBLISHED) {
      const publishedCities = await this.prisma.imageBankCity.count({
        where: { destinationId: id, status: ImageBankStatus.PUBLISHED },
      });
      if (publishedCities < 1) {
        throw new UnprocessableEntityException(
          'Um destino publicado precisa ter ao menos uma cidade publicada.',
        );
      }
    }

    const data: Prisma.ImageBankDestinationUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.country !== undefined) data.country = dto.country;
    if (dto.slug !== undefined) data.slug = dto.slug;
    if (dto.region !== undefined) data.region = dto.region;
    if (dto.summary !== undefined) data.summary = dto.summary;
    if (dto.status !== undefined) data.status = dto.status;
    if (dto.baseTripId !== undefined) {
      if (dto.baseTripId === null) {
        if (current.baseTripId) data.baseTrip = { disconnect: true };
      } else {
        data.baseTrip = { connect: { id: dto.baseTripId } };
      }
    }

    try {
      await this.prisma.imageBankDestination.update({ where: { id }, data });
    } catch (error) {
      this.rethrowPrisma(error);
    }
    return this.getAdminDestination(id);
  }

  async deleteDestination(id: string): Promise<DeletedImageBankRecord> {
    const destination = await this.prisma.imageBankDestination.findUnique({
      where: { id },
      include: {
        cities: { include: { images: { select: { storageKey: true } } } },
      },
    });
    if (!destination) throw new NotFoundException('Destino não encontrado');
    const keys = destination.cities.flatMap((city) =>
      city.images.map((image) => image.storageKey),
    );
    await this.prisma.imageBankDestination.delete({ where: { id } });
    await this.removeStoredKeys(keys);
    return { id, deletedImageRows: keys.length };
  }

  async createCity(
    destinationId: string,
    dto: CreateCityDto,
  ): Promise<CitySummary> {
    const destination = await this.prisma.imageBankDestination.findUnique({
      where: { id: destinationId },
      select: { id: true },
    });
    if (!destination) throw new NotFoundException('Destino não encontrado');

    const slug = await this.allocateCitySlug(destinationId, dto.slug, dto.name);
    const sortOrder =
      dto.sortOrder ?? (await this.nextCitySortOrder(destinationId));
    try {
      const city = await this.prisma.imageBankCity.create({
        data: {
          destinationId,
          name: dto.name,
          slug,
          summary: dto.summary ?? null,
          sortOrder,
          status: ImageBankStatus.DRAFT,
        },
      });
      return this.toCitySummary(city, 0);
    } catch (error) {
      this.rethrowPrisma(error);
    }
  }

  async updateCity(id: string, dto: UpdateCityDto): Promise<CitySummary> {
    const city = await this.prisma.imageBankCity.findUnique({
      where: { id },
      include: { destination: { select: { id: true, status: true } } },
    });
    if (!city) throw new NotFoundException('Cidade não encontrada');
    if (dto.slug && dto.slug !== city.slug) {
      const clash = await this.prisma.imageBankCity.findFirst({
        where: {
          destinationId: city.destinationId,
          slug: dto.slug,
          NOT: { id },
        },
        select: { id: true },
      });
      if (clash) {
        throw new ConflictException(
          'Já existe uma cidade com esse slug neste destino',
        );
      }
    }

    if (dto.status === ImageBankStatus.PUBLISHED) {
      const originals = await this.countOriginals(id);
      if (originals !== PUBLISHED_CITY_IMAGE_COUNT) {
        throw new UnprocessableEntityException(publishedCityMessage(originals));
      }
    }

    if (
      dto.status === ImageBankStatus.DRAFT &&
      city.status === ImageBankStatus.PUBLISHED &&
      city.destination.status === ImageBankStatus.PUBLISHED
    ) {
      await this.assertDestinationKeepsPublishedCity(city.destinationId, id);
    }

    const data: Prisma.ImageBankCityUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.slug !== undefined) data.slug = dto.slug;
    if (dto.summary !== undefined) data.summary = dto.summary;
    if (dto.sortOrder !== undefined) data.sortOrder = dto.sortOrder;
    if (dto.status !== undefined) data.status = dto.status;

    try {
      const updated = await this.prisma.imageBankCity.update({
        where: { id },
        data,
      });
      return this.toCitySummary(updated, await this.countOriginals(id));
    } catch (error) {
      this.rethrowPrisma(error);
    }
  }

  async deleteCity(id: string): Promise<DeletedImageBankRecord> {
    const city = await this.prisma.imageBankCity.findUnique({
      where: { id },
      include: {
        destination: { select: { status: true } },
        images: { select: { storageKey: true } },
      },
    });
    if (!city) throw new NotFoundException('Cidade não encontrada');
    if (
      city.status === ImageBankStatus.PUBLISHED &&
      city.destination.status === ImageBankStatus.PUBLISHED
    ) {
      await this.assertDestinationKeepsPublishedCity(city.destinationId, id);
    }
    const keys = city.images.map((image) => image.storageKey);
    await this.prisma.imageBankCity.delete({ where: { id } });
    await this.removeStoredKeys(keys);
    return { id, deletedImageRows: keys.length };
  }

  async uploadImage(
    cityId: string,
    file: Express.Multer.File | undefined,
    dto: UploadSpotImageDto,
  ): Promise<AdminSpotImage> {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Nenhum arquivo enviado');
    }
    const bytes = file.buffer.length;
    const maxBytes = imageBankMaxBytes();
    if (bytes > maxBytes) {
      throw new BadRequestException(
        `A imagem passa de ${Math.floor(maxBytes / (1024 * 1024))} MB`,
      );
    }
    const inspected = inspectImage(file.buffer);
    if (!inspected) {
      throw new BadRequestException(
        'Envie um JPEG, PNG ou WebP com largura e altura legíveis',
      );
    }

    const city = await this.prisma.imageBankCity.findUnique({
      where: { id: cityId },
      select: { id: true },
    });
    if (!city) throw new NotFoundException('Cidade não encontrada');

    const ext = extensionFor(inspected.mimeType);
    const uploaded = await this.storage.uploadFile(
      {
        ...file,
        originalname: withExtension(file.originalname, ext),
        mimetype: inspected.mimeType,
        size: bytes,
      },
      `image-bank/${cityId}`,
    );

    let saved: SavedOriginal;
    try {
      saved = await this.prisma.$transaction(async (tx) => {
        const existing = await tx.imageBankSpotImage.findFirst({
          where: {
            cityId,
            variant: ImageBankImageVariant.ORIGINAL,
            sortOrder: dto.sortOrder,
          },
        });
        const data = {
          spotName: dto.spotName,
          altText: dto.altText,
          sortOrder: dto.sortOrder,
          storageKey: uploaded.key,
          mimeType: inspected.mimeType,
          width: inspected.width,
          height: inspected.height,
          bytes,
          variant: ImageBankImageVariant.ORIGINAL,
        };
        if (existing) {
          const derivatives = await tx.imageBankSpotImage.findMany({
            where: { derivedFromId: existing.id },
            select: { storageKey: true },
          });
          if (derivatives.length > 0) {
            await tx.imageBankSpotImage.deleteMany({
              where: { derivedFromId: existing.id },
            });
          }
          const image = await tx.imageBankSpotImage.update({
            where: { id: existing.id },
            data,
          });
          return {
            image,
            replacedKeys: [
              existing.storageKey,
              ...derivatives.map((item) => item.storageKey),
            ],
          };
        }

        const count = await tx.imageBankSpotImage.count({
          where: { cityId, variant: ImageBankImageVariant.ORIGINAL },
        });
        if (count >= PUBLISHED_CITY_IMAGE_COUNT) {
          throw new UnprocessableEntityException(
            `Uma cidade tem no máximo ${PUBLISHED_CITY_IMAGE_COUNT} imagens de pontos turísticos. Use o mesmo sortOrder para substituir uma foto.`,
          );
        }
        const image = await tx.imageBankSpotImage.create({
          data: { ...data, cityId },
        });
        return { image, replacedKeys: [] };
      });
    } catch (error) {
      await this.removeStoredKey(uploaded.key);
      if (error instanceof HttpException) throw error;
      this.rethrowPrisma(error);
    }

    await this.removeStoredKeys(
      saved.replacedKeys.filter((key) => key !== uploaded.key),
    );
    this.logger.log(
      `Imagem ${saved.image.id} gravada em ${saved.image.storageKey} (${saved.image.bytes} bytes)`,
    );
    return this.toAdminReadUrl(saved.image);
  }

  async updateImage(
    id: string,
    dto: UpdateSpotImageDto,
  ): Promise<AdminSpotImage> {
    const image = await this.prisma.imageBankSpotImage.findUnique({
      where: { id },
    });
    if (!image) throw new NotFoundException('Imagem não encontrada');

    const spotName = dto.spotName ?? image.spotName;
    const altText = dto.altText ?? image.altText;
    const sortOrder = dto.sortOrder ?? image.sortOrder;

    try {
      if (sortOrder !== image.sortOrder) {
        await this.prisma.$transaction(async (tx) => {
          const other = await tx.imageBankSpotImage.findFirst({
            where: {
              cityId: image.cityId,
              variant: image.variant,
              sortOrder,
              NOT: { id: image.id },
            },
          });
          if (other) {
            await tx.imageBankSpotImage.update({
              where: { id: other.id },
              data: { sortOrder: -1 },
            });
          }
          await tx.imageBankSpotImage.update({
            where: { id: image.id },
            data: { spotName, altText, sortOrder },
          });
          if (other) {
            await tx.imageBankSpotImage.update({
              where: { id: other.id },
              data: { sortOrder: image.sortOrder },
            });
          }
        });
      } else {
        await this.prisma.imageBankSpotImage.update({
          where: { id },
          data: { spotName, altText },
        });
      }
    } catch (error) {
      this.rethrowPrisma(error);
    }

    const fresh = await this.prisma.imageBankSpotImage.findUnique({
      where: { id },
    });
    if (!fresh) throw new NotFoundException('Imagem não encontrada');
    return this.toAdminReadUrl(fresh);
  }

  async deleteImage(id: string): Promise<DeletedImageBankRecord> {
    const image = await this.prisma.imageBankSpotImage.findUnique({
      where: { id },
      include: { city: { select: { status: true } } },
    });
    if (!image) throw new NotFoundException('Imagem não encontrada');
    if (
      image.variant === ImageBankImageVariant.ORIGINAL &&
      image.city.status === ImageBankStatus.PUBLISHED
    ) {
      throw new ConflictException(
        'Cidade publicada precisa manter 5 imagens. Despublique a cidade antes de remover.',
      );
    }

    const related = await this.prisma.imageBankSpotImage.findMany({
      where: { OR: [{ id }, { derivedFromId: id }] },
      select: { storageKey: true },
    });
    await this.prisma.imageBankSpotImage.deleteMany({
      where: { OR: [{ id }, { derivedFromId: id }] },
    });
    await this.removeStoredKeys(related.map((item) => item.storageKey));
    return { id, deletedImageRows: related.length };
  }

  private async presentPublicImages(
    images: ImageBankSpotImage[],
  ): Promise<PublicSpotImage[]> {
    return Promise.all(
      images.map(async (image) =>
        toPublicImage(
          image,
          await this.storage.resolveReadUrl(image.storageKey),
        ),
      ),
    );
  }

  private async presentAdminImages(
    images: ImageBankSpotImage[],
  ): Promise<AdminSpotImage[]> {
    return Promise.all(images.map((image) => this.toAdminReadUrl(image)));
  }

  private async toAdminReadUrl(
    image: ImageBankSpotImage,
  ): Promise<AdminSpotImage> {
    return toAdminImage(
      image,
      await this.storage.resolveReadUrl(image.storageKey),
    );
  }

  private toCitySummary(
    city: {
      id: string;
      destinationId: string;
      slug: string;
      name: string;
      summary: string | null;
      sortOrder: number;
      status: ImageBankStatus;
    },
    originalImageCount: number,
  ): CitySummary {
    return {
      id: city.id,
      destinationId: city.destinationId,
      slug: city.slug,
      name: city.name,
      summary: city.summary,
      sortOrder: city.sortOrder,
      status: city.status,
      originalImageCount,
    };
  }

  private page(query: PublicListQueryDto): { limit: number; offset: number } {
    return { limit: query.limit ?? 50, offset: query.offset ?? 0 };
  }

  private async countOriginals(cityId: string): Promise<number> {
    return this.prisma.imageBankSpotImage.count({
      where: { cityId, variant: ImageBankImageVariant.ORIGINAL },
    });
  }

  private async assertDestinationKeepsPublishedCity(
    destinationId: string,
    exceptCityId: string,
  ): Promise<void> {
    const others = await this.prisma.imageBankCity.count({
      where: {
        destinationId,
        status: ImageBankStatus.PUBLISHED,
        NOT: { id: exceptCityId },
      },
    });
    if (others < 1) {
      throw new UnprocessableEntityException(
        'O destino está publicado e ficaria sem cidade publicada. Despublique o destino antes.',
      );
    }
  }

  private async assertBaseTrip(id: string): Promise<void> {
    const baseTrip = await this.prisma.baseTrip.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!baseTrip) {
      throw new BadRequestException(
        'baseTripId não corresponde a uma BaseTrip',
      );
    }
  }

  private async allocateDestinationSlug(
    requested: string | undefined,
    name: string,
  ): Promise<string> {
    if (requested) {
      await this.assertDestinationSlugAvailable(requested);
      return requested;
    }
    return this.withNumericSuffix(slugify(name), async (slug) => {
      const found = await this.prisma.imageBankDestination.findUnique({
        where: { slug },
        select: { id: true },
      });
      return Boolean(found);
    });
  }

  private async allocateCitySlug(
    destinationId: string,
    requested: string | undefined,
    name: string,
  ): Promise<string> {
    if (requested) {
      const found = await this.prisma.imageBankCity.findFirst({
        where: { destinationId, slug: requested },
        select: { id: true },
      });
      if (found) {
        throw new ConflictException(
          'Já existe uma cidade com esse slug neste destino',
        );
      }
      return requested;
    }
    return this.withNumericSuffix(slugify(name), async (slug) => {
      const found = await this.prisma.imageBankCity.findFirst({
        where: { destinationId, slug },
        select: { id: true },
      });
      return Boolean(found);
    });
  }

  private async assertDestinationSlugAvailable(slug: string): Promise<void> {
    const found = await this.prisma.imageBankDestination.findUnique({
      where: { slug },
      select: { id: true },
    });
    if (found) {
      throw new ConflictException('Já existe um destino com esse slug');
    }
  }

  private async withNumericSuffix(
    base: string,
    taken: (slug: string) => Promise<boolean>,
  ): Promise<string> {
    let slug = base;
    for (let n = 2; n <= 50; n += 1) {
      if (!(await taken(slug))) return slug;
      const suffix = `-${n}`;
      slug = `${base.slice(0, 80 - suffix.length)}${suffix}`;
    }
    throw new ConflictException('Não foi possível gerar um slug único');
  }

  private async nextCitySortOrder(destinationId: string): Promise<number> {
    const last = await this.prisma.imageBankCity.aggregate({
      where: { destinationId },
      _max: { sortOrder: true },
    });
    return (last._max.sortOrder ?? -1) + 1;
  }

  private async removeStoredKeys(keys: string[]): Promise<void> {
    await Promise.all(keys.map((key) => this.removeStoredKey(key)));
  }

  private async removeStoredKey(key: string): Promise<void> {
    try {
      await this.storage.deleteByKey(key);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'erro';
      this.logger.warn(`Falha ao remover objeto ${key}: ${message}`);
    }
  }

  private rethrowPrisma(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        throw new ConflictException(uniqueMessage(error.meta));
      }
      if (error.code === 'P2003') {
        throw new BadRequestException(
          'baseTripId não corresponde a uma BaseTrip',
        );
      }
      if (error.code === 'P2025') {
        throw new NotFoundException('Registro não encontrado');
      }
    }
    if (error instanceof Error) throw error;
    throw new Error('Erro de persistência');
  }
}

function publishedCityMessage(count: number): string {
  return `Uma cidade publicada precisa ter exatamente ${PUBLISHED_CITY_IMAGE_COUNT} imagens de pontos turísticos (há ${count}). Rascunho pode ter menos.`;
}

function extensionFor(mime: ImageMimeType): string {
  if (mime === 'image/png') return '.png';
  if (mime === 'image/webp') return '.webp';
  return '.jpg';
}

function withExtension(originalName: string, ext: string): string {
  const raw = (originalName || 'spot').trim() || 'spot';
  const slash = Math.max(raw.lastIndexOf('/'), raw.lastIndexOf('\\'));
  const base = slash >= 0 ? raw.slice(slash + 1) : raw;
  const dot = base.lastIndexOf('.');
  const stem = (dot > 0 ? base.slice(0, dot) : base).trim() || 'spot';
  return `${stem}${ext}`;
}

function uniqueMessage(
  meta: Prisma.PrismaClientKnownRequestError['meta'],
): string {
  if (!meta || typeof meta !== 'object' || !('target' in meta)) {
    return 'Já existe um registro com esse identificador';
  }
  const target = meta.target;
  if (
    Array.isArray(target) &&
    target.every((item) => typeof item === 'string')
  ) {
    return `Já existe um registro com o mesmo ${target.join(', ')}`;
  }
  if (typeof target === 'string') {
    return `Já existe um registro com o mesmo ${target}`;
  }
  return 'Já existe um registro com esse identificador';
}
