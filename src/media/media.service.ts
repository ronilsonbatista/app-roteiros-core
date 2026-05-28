import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LocalMediaStorageProvider } from './providers/local-media-storage.provider';

@Injectable()
export class MediaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mediaProvider: LocalMediaStorageProvider,
  ) {}

  async uploadAvatar(userId: string, file: Express.Multer.File) {
    if (!file) throw new BadRequestException('Nenhum arquivo enviado');
    
    const result = await this.mediaProvider.uploadFile(file, 'avatars');
    
    await this.prisma.user.update({
      where: { id: userId },
      data: { photoUrl: result.url },
    });

    return result;
  }

  async uploadBaseTripCover(id: string, file: Express.Multer.File) {
    if (!file) throw new BadRequestException('Nenhum arquivo enviado');
    
    const trip = await this.prisma.baseTrip.findUnique({ where: { id } });
    if (!trip) throw new NotFoundException('BaseTrip não encontrada');

    const result = await this.mediaProvider.uploadFile(file, 'base-trips');

    await this.prisma.baseTrip.update({
      where: { id },
      data: { coverImage: result.url },
    });

    return result;
  }

  async uploadBaseAttractionImage(id: string, file: Express.Multer.File) {
    if (!file) throw new BadRequestException('Nenhum arquivo enviado');
    
    const attr = await this.prisma.baseAttraction.findUnique({ where: { id } });
    if (!attr) throw new NotFoundException('BaseAttraction não encontrada');

    const result = await this.mediaProvider.uploadFile(file, 'base-attractions');

    await this.prisma.baseAttraction.update({
      where: { id },
      data: { image: result.url },
    });

    return result;
  }

  async uploadBaseRestaurantImage(id: string, file: Express.Multer.File) {
    if (!file) throw new BadRequestException('Nenhum arquivo enviado');
    
    const rest = await this.prisma.baseRestaurant.findUnique({ where: { id } });
    if (!rest) throw new NotFoundException('BaseRestaurant não encontrado');

    const result = await this.mediaProvider.uploadFile(file, 'base-restaurants');

    await this.prisma.baseRestaurant.update({
      where: { id },
      data: { image: result.url },
    });

    return result;
  }

  async uploadTripCover(userId: string, tripId: string, file: Express.Multer.File) {
    if (!file) throw new BadRequestException('Nenhum arquivo enviado');
    
    const trip = await this.prisma.trip.findUnique({ where: { id: tripId } });
    if (!trip) throw new NotFoundException('Trip não encontrada');
    if (trip.userId !== userId) throw new ForbiddenException('Apenas o dono da viagem pode alterar a capa');

    const result = await this.mediaProvider.uploadFile(file, 'trips');

    await this.prisma.trip.update({
      where: { id: tripId },
      data: { coverImage: result.url },
    });

    return result;
  }
}
